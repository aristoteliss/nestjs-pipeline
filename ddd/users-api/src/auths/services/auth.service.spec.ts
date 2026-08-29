import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { decodeJwt } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../users/domain/models/user.entity';
import { AuthService } from './auth.service';

const originalJwtSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

describe('AuthService', () => {
  it('binds issued access tokens to the active tenant', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
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
});
