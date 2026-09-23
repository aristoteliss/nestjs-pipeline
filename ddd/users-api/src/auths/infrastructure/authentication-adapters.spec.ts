/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
import { decodeJwt } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { TenantSchemaContext } from '../../persistence/tenant-schema.context';
import { User } from '../../users/domain/models/user.entity';
import {
  AuthConfigurationException,
  InvalidLoginCredentialsException,
} from '../domain/errors/authentication.exception';
import { JoseAccessTokenIssuer } from './jose-access-token.issuer';
import { SharedDemoLoginCodeVerifier } from './shared-demo-login-code.verifier';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('authentication infrastructure adapters', () => {
  it('verifies a configured SHA-256 login-code digest', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_SHARED_LOGIN_CODE = 'true';
    delete process.env.AUTH_LOGIN_CODE;
    process.env.AUTH_LOGIN_CODE_SHA256 = createHash('sha256')
      .update('424242', 'utf8')
      .digest('hex');

    const verifier = new SharedDemoLoginCodeVerifier();
    expect(() =>
      verifier.verify({ userId: 'user-1', code: '424242' }),
    ).not.toThrow();
    expect(() => verifier.verify({ userId: 'user-1', code: '000000' })).toThrow(
      InvalidLoginCredentialsException,
    );
  });

  it('refuses a shared login code in production without acknowledgement', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_SHARED_LOGIN_CODE;
    delete process.env.AUTH_LOGIN_CODE;
    process.env.AUTH_LOGIN_CODE_SHA256 = createHash('sha256')
      .update('424242', 'utf8')
      .digest('hex');

    expect(() =>
      new SharedDemoLoginCodeVerifier().verify({
        userId: 'user-1',
        code: '424242',
      }),
    ).toThrow(AuthConfigurationException);
  });

  it('rejects plaintext login-code configuration in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_SHARED_LOGIN_CODE = 'true';
    delete process.env.AUTH_LOGIN_CODE_SHA256;
    process.env.AUTH_LOGIN_CODE = '424242';

    expect(() =>
      new SharedDemoLoginCodeVerifier().verify({
        userId: 'user-1',
        code: '424242',
      }),
    ).toThrow(AuthConfigurationException);
  });

  it('keeps plaintext login-code compatibility for non-production demos', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AUTH_LOGIN_CODE_SHA256;
    process.env.AUTH_LOGIN_CODE = '424242';

    expect(() =>
      new SharedDemoLoginCodeVerifier().verify({
        userId: 'user-1',
        code: '424242',
      }),
    ).not.toThrow();
  });

  it('issues tenant-bound JWTs through the infrastructure adapter', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    delete process.env.JWT_ALGORITHMS;
    const tenantContext = new TenantSchemaContext();
    const issuer = new JoseAccessTokenIssuer(tenantContext);
    const user = User.create('Alice', 'alice@example.test', 'Engineering');

    const sessionId = '019488e0-0000-7000-8000-0000000000aa';
    const result = await tenantContext.run('tenant_a', () =>
      issuer.issue({ user, sessionId }),
    );

    const payload = decodeJwt(result.accessToken);
    expect(payload.sub).toBe(user.id);
    expect(payload.sid).toBe(sessionId);
    expect(payload.tenant).toBe('tenant_a');
    expect(payload.principalType).toBe('user');
    expect(payload.exp).toBe((payload.iat as number) + 300);
    expect(result.expiresAt).toBe((payload.exp as number) * 1000);
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('department');
    expect(payload).not.toHaveProperty('perms');
    expect(payload).not.toHaveProperty('roles');
    expect(payload).not.toHaveProperty('additionalCapabilities');
    expect(payload).not.toHaveProperty('deniedCapabilities');
    expect(payload.jti).toBeDefined();
  });

  it('rejects local issuance when HS256 is excluded', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    process.env.JWT_ALGORITHMS = 'RS256';
    const issuer = new JoseAccessTokenIssuer(new TenantSchemaContext());
    const user = User.create('Alice', 'alice@example.test');

    await expect(issuer.issue({ user, sessionId: 's' })).rejects.toThrow(
      AuthConfigurationException,
    );
  });
});
