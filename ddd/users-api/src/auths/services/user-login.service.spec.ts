import { describe, expect, it, vi } from 'vitest';
import { User } from '../../users/domain/models/user.entity';
import { InvalidLoginCredentialsException } from '../domain/errors/authentication.exception';
import { UserLoginService } from './user-login.service';

const capabilities = {
  roles: ['admin'],
  additionalCapabilities: [],
  deniedCapabilities: [],
};

describe('UserLoginService', () => {
  it('orchestrates code verification and user lookup without reading environment configuration', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const verify = vi.fn();
    const find = vi.fn().mockResolvedValue(user);
    const service = new UserLoginService(
      { execute: vi.fn() } as never,
      { find } as never,
      { verify } as never,
      { issue: vi.fn() } as never,
    );

    await expect(
      service.authenticate('alice@example.test', '424242'),
    ).resolves.toBe(user);
    expect(verify).toHaveBeenCalledWith('424242');
    expect(find).toHaveBeenCalledOnce();
  });

  it('expresses unknown users as a framework-neutral authentication failure', async () => {
    const service = new UserLoginService(
      { execute: vi.fn() } as never,
      { find: vi.fn().mockResolvedValue(null) } as never,
      { verify: vi.fn() } as never,
      { issue: vi.fn() } as never,
    );

    await expect(
      service.authenticate('missing@example.test', '424242'),
    ).rejects.toBeInstanceOf(InvalidLoginCredentialsException);
  });

  it('delegates token materialization after resolving capabilities', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const execute = vi.fn().mockResolvedValue(capabilities);
    const issue = vi.fn().mockResolvedValue({
      accessToken: 'adapter-token',
      expiresAt: 123000,
      exp: 123,
    });
    const service = new UserLoginService(
      { execute } as never,
      { find: vi.fn() } as never,
      { verify: vi.fn() } as never,
      { issue } as never,
    );

    await expect(service.signToken(user)).resolves.toEqual({
      userId: user.id,
      userCapabilities: capabilities,
      accessToken: 'adapter-token',
      expiresAt: 123000,
      exp: 123,
    });
    expect(issue).toHaveBeenCalledWith({ user, capabilities });
  });
});
