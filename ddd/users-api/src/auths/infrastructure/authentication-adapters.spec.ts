import { decodeJwt } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { User } from '../../users/domain/models/user.entity';
import { AuthConfigurationException, InvalidLoginCredentialsException } from '../domain/errors/authentication.exception';
import { EnvLoginCodeVerifier } from './env-login-code.verifier';
import { JoseAccessTokenIssuer } from './jose-access-token.issuer';

const originalCode = process.env.AUTH_LOGIN_CODE;
const originalSecret = process.env.JWT_SECRET;
const originalAlgorithms = process.env.JWT_ALGORITHMS;

afterEach(() => {
  process.env.AUTH_LOGIN_CODE = originalCode;
  process.env.JWT_SECRET = originalSecret;
  process.env.JWT_ALGORITHMS = originalAlgorithms;
});

describe('authentication infrastructure adapters', () => {
  it('keeps environment-backed login-code verification outside UserLoginService', () => {
    process.env.AUTH_LOGIN_CODE = '424242';
    const verifier = new EnvLoginCodeVerifier();
    expect(() => verifier.verify('424242')).not.toThrow();
    expect(() => verifier.verify('000000')).toThrow(InvalidLoginCredentialsException);
  });

  it('fails with a neutral configuration error when login code is not configured', () => {
    delete process.env.AUTH_LOGIN_CODE;
    expect(() => new EnvLoginCodeVerifier().verify('424242')).toThrow(
      AuthConfigurationException,
    );
  });

  it('issues a tenant-bound JWT through the Jose adapter', async () => {
    process.env.JWT_SECRET = 'adapter-test-secret';
    delete process.env.JWT_ALGORITHMS;
    const user = User.create('Alice', 'alice@example.test', 'Engineering');
    const issuer = new JoseAccessTokenIssuer({ schema: 'tenant_a' } as never);

    const result = await issuer.issue({
      user,
      capabilities: {
        roles: ['admin'],
        additionalCapabilities: [],
        deniedCapabilities: [],
      },
    });

    const payload = decodeJwt(result.accessToken);
    expect(payload.sub).toBe(user.id);
    expect(payload.tenant).toBe('tenant_a');
    expect(payload.roles).toEqual(['admin']);
  });
});
