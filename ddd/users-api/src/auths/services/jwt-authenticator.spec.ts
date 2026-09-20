/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { generateKeyPairSync } from 'node:crypto';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { exportSPKI, importSPKI, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthenticator } from './jwt-authenticator';

vi.mock('jose', async (importOriginal) => {
  const real = await importOriginal<typeof import('jose')>();
  return { ...real, importSPKI: vi.fn(real.importSPKI) };
});

beforeEach(() => {
  vi.mocked(importSPKI).mockClear();
});

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
      principalType: 'user',
      tenant: tenantContext.schema,
    });
    expect(user).not.toHaveProperty('email');
    expect(user).not.toHaveProperty('capabilities');
    expect(user).not.toHaveProperty('grants');
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
    expect(user?.principalType).toBe('user');
  });

  it('reuses unchanged SPKI candidates and rebuilds them when the key rotates', async () => {
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
    // Request 1: Must parse SPKI key
    const res1 = await authenticator.authenticate({
      headers: { authorization: `Bearer ${token1}` },
    });
    expect(res1?.id).toBe('user-req-1');
    expect(importSPKI).toHaveBeenCalledTimes(1);

    // Request 2: Must reuse cached key candidates, reuse the imported SPKI key
    const res2 = await authenticator.authenticate({
      headers: { authorization: `Bearer ${token2}` },
    });
    expect(res2?.id).toBe('user-req-2');
    expect(importSPKI).toHaveBeenCalledTimes(1);

    const rotated = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.JWT_PUBLIC_KEY = await exportSPKI(rotated.publicKey);
    const rotatedToken = await new SignJWT({
      tenant: tenantContext.schema,
      roles: [],
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('user-rotated')
      .setExpirationTime('1h')
      .sign(rotated.privateKey);
    await expect(
      authenticator.authenticate({
        headers: { authorization: `Bearer ${rotatedToken}` },
      }),
    ).resolves.toMatchObject({ id: 'user-rotated' });
    expect(importSPKI).toHaveBeenCalledTimes(2);
    await expect(
      authenticator.authenticate({
        headers: { authorization: `Bearer ${token1}` },
      }),
    ).rejects.toThrow('Invalid or expired token');
    expect(importSPKI).toHaveBeenCalledTimes(2);
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

  it('preserves exp and sets expiresAt in milliseconds from JWT payload', async () => {
    process.env.JWT_SECRET = 'exp-secret';
    delete process.env.JWT_PUBLIC_KEY;

    const expTime = Math.floor(Date.now() / 1000) + 1800; // 30 minutes in future
    const token = await new SignJWT({
      tenant: tenantContext.schema,
      roles: [],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-exp-check')
      .setExpirationTime(expTime)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    const authenticator = new JwtAuthenticator(tenantContext);
    const user = await authenticator.authenticate({
      headers: { authorization: `Bearer ${token}` },
    });

    expect(user?.exp).toBe(expTime);
    expect(user?.expiresAt).toBe(expTime * 1000);
  });

  it('maps sub, tenant and sid statelessly', async () => {
    process.env.JWT_SECRET = 'stateless-secret';
    delete process.env.JWT_PUBLIC_KEY;

    const token = await new SignJWT({
      tenant: tenantContext.schema,
      sid: 'session-1',
      principalType: 'user',
      email: 'ignored@example.test',
      department: 'ignored',
      perms: ['all|manage|*'],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-active')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    const user = await new JwtAuthenticator(tenantContext).authenticate({
      headers: { authorization: `Bearer ${token}` },
    });

    expect(user).toMatchObject({
      id: 'user-active',
      principalType: 'user',
      tenant: tenantContext.schema,
      sid: 'session-1',
    });
    expect(user).not.toHaveProperty('email');
    expect(user).not.toHaveProperty('department');
    expect(user).not.toHaveProperty('grants');
  });

  it('rejects a token that claims a non-user principal type', async () => {
    process.env.JWT_SECRET = 'principal-secret';
    delete process.env.JWT_PUBLIC_KEY;

    const token = await new SignJWT({
      tenant: tenantContext.schema,
      principalType: 'service',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('svc-1')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    await expect(
      new JwtAuthenticator(tenantContext).authenticate({
        headers: { authorization: `Bearer ${token}` },
      }),
    ).rejects.toThrow('not a user principal');
  });
});
