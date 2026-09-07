import { createHash } from 'node:crypto';
import { decodeJwt } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { TenantSchemaContext } from '../../persistence/tenant-schema.context';
import { User } from '../../users/domain/models/user.entity';
import {
  AuthConfigurationException,
  InvalidLoginCredentialsException,
} from '../domain/errors/authentication.exception';
import { EnvLoginCodeVerifier } from './env-login-code.verifier';
import { JoseAccessTokenIssuer } from './jose-access-token.issuer';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('authentication infrastructure adapters', () => {
  it('verifies a configured SHA-256 login-code digest', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_LOGIN_CODE;
    process.env.AUTH_LOGIN_CODE_SHA256 = createHash('sha256')
      .update('424242', 'utf8')
      .digest('hex');

    const verifier = new EnvLoginCodeVerifier();
    expect(() => verifier.verify('424242')).not.toThrow();
    expect(() => verifier.verify('000000')).toThrow(
      InvalidLoginCredentialsException,
    );
  });

  it('rejects plaintext login-code configuration in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_LOGIN_CODE_SHA256;
    process.env.AUTH_LOGIN_CODE = '424242';

    expect(() => new EnvLoginCodeVerifier().verify('424242')).toThrow(
      AuthConfigurationException,
    );
  });

  it('keeps plaintext login-code compatibility for non-production demos', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AUTH_LOGIN_CODE_SHA256;
    process.env.AUTH_LOGIN_CODE = '424242';

    expect(() => new EnvLoginCodeVerifier().verify('424242')).not.toThrow();
  });

  it('issues tenant-bound JWTs through the infrastructure adapter', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    delete process.env.JWT_ALGORITHMS;
    const tenantContext = new TenantSchemaContext();
    const issuer = new JoseAccessTokenIssuer(tenantContext);
    const user = User.create('Alice', 'alice@example.test', 'Engineering');

    const result = await tenantContext.run('tenant_a', () =>
      issuer.issue({
        user,
        capabilities: {
          roles: ['admin'],
          additionalCapabilities: [],
          deniedCapabilities: [],
        },
      }),
    );

    const payload = decodeJwt(result.accessToken);
    expect(payload.sub).toBe(user.id);
    expect(payload.tenant).toBe('tenant_a');
    expect(payload.roles).toEqual(['admin']);
    expect(payload.jti).toBeDefined();
  });

  it('rejects local issuance when HS256 is excluded', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    process.env.JWT_ALGORITHMS = 'RS256';
    const issuer = new JoseAccessTokenIssuer(new TenantSchemaContext());
    const user = User.create('Alice', 'alice@example.test');

    await expect(
      issuer.issue({
        user,
        capabilities: {
          roles: [],
          additionalCapabilities: [],
          deniedCapabilities: [],
        },
      }),
    ).rejects.toThrow(AuthConfigurationException);
  });
});
