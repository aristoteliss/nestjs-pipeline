import { generateKeyPairSync } from 'node:crypto';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { exportSPKI, SignJWT } from 'jose';
import { lastValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthSessionInterceptor } from './auth-session.interceptor';

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
  for (const key of ENV_KEYS) {
    const original = originalEnv.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

async function verifyRs256Token(publicKeyEnv: string) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  // This helper is only used by tests that create the matching public key
  // separately; callers overwrite JWT_PUBLIC_KEY before invoking interception.
  process.env.JWT_PUBLIC_KEY = publicKeyEnv;
  process.env.JWT_PUBLIC_KEY_ALG = 'RS256';
  delete process.env.JWT_ALGORITHMS;
  delete process.env.JWT_SECRET;

  const token = await new SignJWT({ email: 'user@example.test', roles: [] })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setSubject('user-1')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

  return token;
}

function makeRequest(token: string) {
  const sessionData = new Map<string, unknown>();
  const session = {
    get: vi.fn((key: string) => sessionData.get(key)),
    set: vi.fn((key: string, value: unknown) => sessionData.set(key, value)),
  };
  const request = {
    headers: { authorization: `Bearer ${token}` },
    session,
  };
  const executionContext = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: vi.fn(() => of('ok')) };
  return { session, executionContext, next };
}

describe('AuthSessionInterceptor JWT verification', () => {
  it('uses JWT_PUBLIC_KEY_ALG as the default verification algorithm for a public key', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    process.env.JWT_PUBLIC_KEY = await exportSPKI(publicKey);
    process.env.JWT_PUBLIC_KEY_ALG = 'RS256';
    delete process.env.JWT_ALGORITHMS;
    delete process.env.JWT_SECRET;

    const token = await new SignJWT({ email: 'user@example.test', roles: [] })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const { session, executionContext, next } = makeRequest(token);

    const result = await lastValueFrom(
      new AuthSessionInterceptor().intercept(executionContext, next),
    );

    expect(result).toBe('ok');
    expect(session.set).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({ id: 'user-1', email: 'user@example.test' }),
    );
    expect(next.handle).toHaveBeenCalledOnce();
  });

  it('accepts a JWT_PUBLIC_KEY copied from an env file with escaped newlines', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const pem = await exportSPKI(publicKey);
    process.env.JWT_PUBLIC_KEY = pem.replace(/\n/g, '\\n');
    process.env.JWT_PUBLIC_KEY_ALG = 'RS256';
    delete process.env.JWT_ALGORITHMS;
    delete process.env.JWT_SECRET;

    const token = await new SignJWT({ email: 'escaped@example.test', roles: [] })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setSubject('user-escaped')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const { session, executionContext, next } = makeRequest(token);
    const result = await lastValueFrom(
      new AuthSessionInterceptor().intercept(executionContext, next),
    );

    expect(result).toBe('ok');
    expect(session.set).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({
        id: 'user-escaped',
        email: 'escaped@example.test',
      }),
    );
  });
});
