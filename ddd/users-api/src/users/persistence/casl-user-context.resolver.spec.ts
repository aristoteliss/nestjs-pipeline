import { describe, expect, it, vi } from 'vitest';
import { User } from '../domain/models/user.entity';
import { CaslUserContextResolver } from './casl-user-context.resolver';

describe('CaslUserContextResolver', () => {
  it('refreshes persisted user context regardless of identifier syntax', async () => {
    const user = User.create('Bob', 'bob@example.test', 'Executive');
    const findOne = vi.fn().mockResolvedValue(user);
    const resolver = new CaslUserContextResolver({
      get em() {
        return { findOne };
      },
    } as never, ['sessionUser']);

    const result = await resolver.resolve({
      request: {
        sessionUser: {
          id: 'human-readable-user-id',
          principalType: 'user',
          department: 'stale',
          capabilities: { roles: ['manager'] },
        },
      },
    } as never);

    expect(findOne).toHaveBeenCalledWith(User, { id: 'human-readable-user-id' });
    expect(result).toEqual({
      id: user.id,
      department: 'Executive',
      capabilities: { roles: ['manager'] },
    });
  });

  it('does not treat a UUID-shaped service principal as a persisted user', async () => {
    const findOne = vi.fn();
    const resolver = new CaslUserContextResolver({
      get em() {
        return { findOne };
      },
    } as never, ['sessionUser']);

    const result = await resolver.resolve({
      request: {
        sessionUser: {
          id: '019488e0-0000-7000-8000-000000000001',
          principalType: 'service',
          department: 'platform',
          capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
        },
      },
    } as never);

    expect(findOne).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: '019488e0-0000-7000-8000-000000000001',
      department: 'platform',
      capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
    });
  });

  it('fails closed when principal classification is missing', async () => {
    const findOne = vi.fn();
    const resolver = new CaslUserContextResolver({
      get em() {
        return { findOne };
      },
    } as never, ['sessionUser']);

    const result = await resolver.resolve({
      request: {
        sessionUser: {
          id: 'legacy-principal',
          capabilities: { roles: ['manager'] },
        },
      },
    } as never);

    expect(findOne).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
