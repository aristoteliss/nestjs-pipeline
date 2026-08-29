import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { decodeJwt } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../users/domain/models/user.entity';
import { AuthService } from './auth.service';

const originalJwtSecret = process.env.JWT_SECRET;
const originalJwtAlgorithms = process.env.JWT_ALGORITHMS;

afterEach(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalJwtAlgorithms === undefined) delete process.env.JWT_ALGORITHMS;
  else process.env.JWT_ALGORITHMS = originalJwtAlgorithms;
});

describe('AuthService', () => {
  it('binds issued access tokens to the active tenant', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    delete process.env.JWT_ALGORITHMS;
    const user = User.create('Alice', 'alice@example.test').entity;
    const service = new AuthService(
      {
        execute: vi.fn().mockResolvedValue({
          roles: [],
          additionalCapabilities: [],
          deniedCapabilities: [],
        }),
      } as never,
      { find: vi.fn() } as never,
    );

    const result = await new TenantSchemaContext().run('tenant_a', () =>
      service.signToken(user),
    );

    expect(decodeJwt(result.accessToken).tenant).toBe('tenant_a');
  });

  it('rejects local token issuance when HS256 is excluded', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    process.env.JWT_ALGORITHMS = 'RS256';
    const service = new AuthService(
      { execute: vi.fn() } as never,
      { find: vi.fn() } as never,
    );
    const user = User.create('Alice', 'alice@example.test').entity;

    await expect(service.signToken(user)).rejects.toThrow(
      'JWT_ALGORITHMS must include HS256',
    );
  });
});
