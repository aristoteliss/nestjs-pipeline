/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { generateKeyPairSync } from 'node:crypto';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { exportSPKI, SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthenticator } from './jwt-authenticator';

const ENV_KEYS = [
  'JWT_SECRET',
  'JWT_PUBLIC_KEY',
  'JWT_PUBLIC_KEY_ALG',
  'JWT_ALGORITHMS',
  'JWT_ISSUER',
  'JWT_AUDIENCE',
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) {
    const original = originalEnv.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe('JwtAuthenticator', () => {
  const tenantContext = new TenantSchemaContext();

  it('authenticates an asymmetric RS256 token with SPKI public key', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    process.env.JWT_PUBLIC_KEY = await exportSPKI(publicKey);
    process.env.JWT_PUBLIC_KEY_ALG = 'RS256';
    delete process.env.JWT_SECRET;

    const token = await new SignJWT({
      tenant: tenantContext.schema,
      email: 'asymm@example.test',
      roles: ['admin'],
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setSubject('user-asymm')
      .setExpirationTime('1h')
      .sign(privateKey);

    const authenticator = new JwtAuthenticator(tenantContext);
    const user = await authenticator.authenticate({
      headers: { authorization: `Bearer ${token}` },
    });

    expect(user).toMatchObject({
      id: 'user-asymm',
      email: 'asymm@example.test',
      tenant: tenantContext.schema,
      capabilities: { roles: ['admin'] },
    });
  });

  it('authenticates case-insensitively with lower-case "bearer"', async () => {
    process.env.JWT_SECRET = 'case-secret';
    delete process.env.JWT_PUBLIC_KEY;

    const token = await new SignJWT({
      tenant: tenantContext.schema,
      roles: [],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-lowercase-bearer')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    const authenticator = new JwtAuthenticator(tenantContext);
    const user = await authenticator.authenticate({
      headers: { authorization: `bearer ${token}` },
    });

    expect(user?.id).toBe('user-lowercase-bearer');
  });

  it('genuinely memoizes parsed SPKI public keys across consecutive calls (real spy test)', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    process.env.JWT_PUBLIC_KEY = await exportSPKI(publicKey);
    process.env.JWT_PUBLIC_KEY_ALG = 'RS256';
    delete process.env.JWT_SECRET;

    const token1 = await new SignJWT({
      tenant: tenantContext.schema,
      roles: [],
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('user-req-1')
      .setExpirationTime('1h')
      .sign(privateKey);

    const token2 = await new SignJWT({
      tenant: tenantContext.schema,
      roles: [],
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('user-req-2')
      .setExpirationTime('1h')
      .sign(privateKey);

    const authenticator = new JwtAuthenticator(tenantContext);
    const importSpy = vi.spyOn(
      authenticator as unknown as { importPublicKey: () => unknown },
      'importPublicKey',
    );

    // Request 1: Must parse SPKI key
    const res1 = await authenticator.authenticate({
      headers: { authorization: `Bearer ${token1}` },
    });
    expect(res1?.id).toBe('user-req-1');
    expect(importSpy).toHaveBeenCalledTimes(1);

    // Request 2: Must reuse cached key candidates, NOT call importPublicKey again
    const res2 = await authenticator.authenticate({
      headers: { authorization: `Bearer ${token2}` },
    });
    expect(res2?.id).toBe('user-req-2');
    expect(importSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects when Bearer token is provided but no server keys are configured', async () => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_PUBLIC_KEY;

    const authenticator = new JwtAuthenticator(tenantContext);

    await expect(
      authenticator.authenticate({
        headers: { authorization: 'Bearer arbitrary-token' },
      }),
    ).rejects.toThrow('JWT authentication is not configured');
  });

  it('rejects expired tokens', async () => {
    process.env.JWT_SECRET = 'expired-secret';
    delete process.env.JWT_PUBLIC_KEY;

    const token = await new SignJWT({
      tenant: tenantContext.schema,
      roles: [],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('expired-user')
      .setExpirationTime('-1h')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    const authenticator = new JwtAuthenticator(tenantContext);

    await expect(
      authenticator.authenticate({
        headers: { authorization: `Bearer ${token}` },
      }),
    ).rejects.toThrow('Invalid or expired token');
  });

  it('rejects tokens with mismatched tenant claim', async () => {
    process.env.JWT_SECRET = 'tenant-secret';
    delete process.env.JWT_PUBLIC_KEY;

    const token = await new SignJWT({
      tenant: 'foreign-tenant-xyz',
      roles: [],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-wrong-tenant')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    const authenticator = new JwtAuthenticator(tenantContext);

    await expect(
      authenticator.authenticate({
        headers: { authorization: `Bearer ${token}` },
      }),
    ).rejects.toThrow('Credential tenant does not match the selected tenant');
  });

  it('returns undefined when no authorization header is present', async () => {
    const authenticator = new JwtAuthenticator(tenantContext);
    await expect(
      authenticator.authenticate({ headers: {} }),
    ).resolves.toBeUndefined();
  });
});
