/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { generateKeyPairSync } from 'node:crypto';
import { setTenantResolver } from '@cqrs-ddd/core/application';
import { currentTenantId } from '@cqrs-ddd/pipeline-tenant';
import { exportSPKI, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TENANT = 'tenant';

beforeEach(() => setTenantResolver(() => TENANT));
afterEach(() => setTenantResolver(currentTenantId));

vi.mock('jose', async (importOriginal) => {
  const real = await importOriginal<typeof import('jose')>();
  return { ...real, importSPKI: vi.fn(real.importSPKI) };
});

const ENV_KEYS = [
  'JWT_SECRET',
  'JWT_PUBLIC_KEY',
  'JWT_PUBLIC_KEY_ALG',
  'JWT_ALGORITHMS',
  'JWT_ISSUER',
  'JWT_AUDIENCE',
] as const;

async function load(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) vi.stubEnv(key, env[key]);
  vi.resetModules();
  const { JwtAuthenticator } = await import('./jwt-authenticator.js');
  const importSPKI = vi.mocked((await import('jose')).importSPKI);
  importSPKI.mockClear();
  return { authenticator: new JwtAuthenticator(), importSPKI };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('JwtAuthenticator', () => {
  it('authenticates an asymmetric RS256 token with SPKI public key', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const { authenticator } = await load({
      JWT_PUBLIC_KEY: await exportSPKI(publicKey),
      JWT_PUBLIC_KEY_ALG: 'RS256',
    });
    const token = await new SignJWT({
      tenant: TENANT,
      sid: 'sess-asymm',
      email: 'asymm@example.test',
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setSubject('user-asymm')
      .setExpirationTime('1h')
      .sign(privateKey);

    const user = await authenticator.authenticate({
      headers: { authorization: `Bearer ${token}` },
    });

    expect(user).toMatchObject({
      id: 'user-asymm',
      type: 'user',
      tenant: TENANT,
      sid: 'sess-asymm',
    });
    expect(user).not.toHaveProperty('email');
    expect(user).not.toHaveProperty('capabilities');
    expect(user).not.toHaveProperty('grants');
  });

  it('accepts the lower-case "bearer" scheme', async () => {
    const secret = 'case-secret';
    const { authenticator } = await load({ JWT_SECRET: secret });
    const token = await new SignJWT({
      tenant: TENANT,
      sid: 'sess-lower',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-lowercase-bearer')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secret));

    const user = await authenticator.authenticate({
      headers: { authorization: `bearer ${token}` },
    });

    expect(user?.id).toBe('user-lowercase-bearer');
    expect(user?.type).toBe('user');
    expect(user?.sid).toBe('sess-lower');
  });

  it('imports the SPKI key once and reuses it for later requests', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const { authenticator, importSPKI } = await load({
      JWT_PUBLIC_KEY: await exportSPKI(publicKey),
      JWT_PUBLIC_KEY_ALG: 'RS256',
    });

    for (const subject of ['user-req-1', 'user-req-2']) {
      const token = await new SignJWT({
        tenant: TENANT,
        sid: `sess-${subject}`,
      })
        .setProtectedHeader({ alg: 'RS256' })
        .setSubject(subject)
        .setExpirationTime('1h')
        .sign(privateKey);

      await expect(
        authenticator.authenticate({
          headers: { authorization: `Bearer ${token}` },
        }),
      ).resolves.toMatchObject({ id: subject });
    }
    expect(importSPKI).toHaveBeenCalledTimes(1);
  });

  it('rejects when Bearer token is provided but no server keys are configured', async () => {
    const { authenticator } = await load({});

    await expect(
      authenticator.authenticate({
        headers: { authorization: 'Bearer arbitrary-token' },
      }),
    ).rejects.toThrow('JWT authentication is not configured');
  });

  it('rejects expired tokens', async () => {
    const secret = 'expired-secret';
    const { authenticator } = await load({ JWT_SECRET: secret });
    const token = await new SignJWT({ tenant: TENANT })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('expired-user')
      .setExpirationTime('-1h')
      .sign(new TextEncoder().encode(secret));

    await expect(
      authenticator.authenticate({
        headers: { authorization: `Bearer ${token}` },
      }),
    ).rejects.toThrow('Invalid or expired token');
  });

  it('rejects tokens with mismatched tenant claim', async () => {
    const secret = 'tenant-secret';
    const { authenticator } = await load({ JWT_SECRET: secret });
    const token = await new SignJWT({
      tenant: 'foreign-tenant-xyz',
      sid: 'sess-wrong-tenant',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-wrong-tenant')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secret));

    await expect(
      authenticator.authenticate({
        headers: { authorization: `Bearer ${token}` },
      }),
    ).rejects.toThrow('Credential tenant does not match the selected tenant');
  });

  it('returns undefined when no authorization header is present', async () => {
    const { authenticator } = await load({});

    await expect(
      authenticator.authenticate({ headers: {} }),
    ).resolves.toBeUndefined();
  });

  it('sets expiresAt in milliseconds from the exp claim', async () => {
    const secret = 'exp-secret';
    const { authenticator } = await load({ JWT_SECRET: secret });
    const expTime = Math.floor(Date.now() / 1000) + 1800;
    const token = await new SignJWT({
      tenant: TENANT,
      sid: 'sess-exp',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-exp-check')
      .setExpirationTime(expTime)
      .sign(new TextEncoder().encode(secret));

    const user = await authenticator.authenticate({
      headers: { authorization: `Bearer ${token}` },
    });

    expect(user).not.toHaveProperty('exp');
    expect(user?.expiresAt).toBe(expTime * 1000);
  });

  it('maps sub, tenant and sid statelessly', async () => {
    const secret = 'stateless-secret';
    const { authenticator } = await load({ JWT_SECRET: secret });
    const token = await new SignJWT({
      tenant: TENANT,
      sid: 'session-1',
      principalType: 'user',
      email: 'ignored@example.test',
      department: 'ignored',
      perms: ['all|manage|*'],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-active')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secret));

    const user = await authenticator.authenticate({
      headers: { authorization: `Bearer ${token}` },
    });

    expect(user).toMatchObject({
      id: 'user-active',
      type: 'user',
      tenant: TENANT,
      sid: 'session-1',
    });
    expect(user).not.toHaveProperty('email');
    expect(user).not.toHaveProperty('department');
    expect(user).not.toHaveProperty('grants');
  });

  it('rejects a token that claims a non-user principal type', async () => {
    const secret = 'principal-secret';
    const { authenticator } = await load({ JWT_SECRET: secret });
    const token = await new SignJWT({
      tenant: TENANT,
      sid: 'sess-svc',
      principalType: 'service',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('svc-1')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secret));

    await expect(
      authenticator.authenticate({
        headers: { authorization: `Bearer ${token}` },
      }),
    ).rejects.toThrow('not a user principal');
  });

  it('rejects a token without a sid claim', async () => {
    const secret = 'sid-less-secret';
    const { authenticator } = await load({ JWT_SECRET: secret });
    const tokenWithoutSid = await new SignJWT({ tenant: TENANT })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-without-sid')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secret));

    await expect(
      authenticator.authenticate({
        headers: { authorization: `Bearer ${tokenWithoutSid}` },
      }),
    ).rejects.toThrow('Token is missing its session identifier claim');
  });

  it('rejects tokens missing the exp claim', async () => {
    const secret = 'no-exp-secret';
    const { authenticator } = await load({ JWT_SECRET: secret });
    const tokenWithoutExp = await new SignJWT({
      tenant: TENANT,
      sid: 'sess-no-exp',
      principalType: 'user',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-no-exp')
      .sign(new TextEncoder().encode(secret));

    await expect(
      authenticator.authenticate({
        headers: { authorization: `Bearer ${tokenWithoutExp}` },
      }),
    ).rejects.toThrow('Token is missing its expiration claim');
  });
});
