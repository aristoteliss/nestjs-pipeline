import { generateKeyPairSync } from 'node:crypto';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
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
  'API_CLIENTS',
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

function makeRequest(token: string, withSession = true) {
  const sessionData = new Map<string, unknown>();
  const session = {
    get: vi.fn((key: string) => sessionData.get(key)),
    set: vi.fn((key: string, value: unknown) => sessionData.set(key, value)),
  };
  const request = {
    headers: { authorization: `Bearer ${token}` },
    session: withSession ? session : undefined,
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

    const token = await new SignJWT({
      tenant: TenantSchemaContext.currentSchema,
      email: 'user@example.test',
      roles: [],
    })
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

    const token = await new SignJWT({
      tenant: TenantSchemaContext.currentSchema,
      email: 'escaped@example.test',
      roles: [],
    })
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

  it('authenticates a Bearer token when Express provides no session object', async () => {
    process.env.JWT_SECRET = 'express-jwt-secret';
    const token = await new SignJWT({
      tenant: TenantSchemaContext.currentSchema,
      roles: [],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('express-user')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    const { executionContext, next } = makeRequest(token, false);

    await expect(
      lastValueFrom(
        new AuthSessionInterceptor().intercept(executionContext, next),
      ),
    ).resolves.toBe('ok');
    expect(next.handle).toHaveBeenCalledOnce();
  });

  it('rejects a token bound to a different tenant', async () => {
    process.env.JWT_SECRET = 'tenant-jwt-secret';
    const token = await new SignJWT({ tenant: 'different_tenant', roles: [] })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    const { executionContext, next } = makeRequest(token, false);

    await expect(
      lastValueFrom(
        new AuthSessionInterceptor().intercept(executionContext, next),
      ),
    ).rejects.toThrow('Invalid or expired token');
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('authenticates a tenant-bound API key without an Express session', async () => {
    process.env.API_CLIENTS = JSON.stringify([
      {
        id: 'client-1',
        key: 'secret-1',
        tenant: TenantSchemaContext.currentSchema,
      },
    ]);
    const request = {
      headers: { 'x-api-id': 'client-1', 'x-api-key': 'secret-1' },
    };
    const executionContext = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: vi.fn(() => of('ok')) };

    await expect(
      lastValueFrom(
        new AuthSessionInterceptor().intercept(executionContext, next),
      ),
    ).resolves.toBe('ok');
    expect(next.handle).toHaveBeenCalledOnce();
  });
});
