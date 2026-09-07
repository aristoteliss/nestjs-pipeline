import { describe, expect, it, vi } from 'vitest';
import { User } from '../domain/models/user.entity';
import { CaslUserContextResolver } from './casl-user-context.resolver';

describe('CaslUserContextResolver', () => {
  it('refreshes persisted user context and preserves capabilities', async () => {
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
          id: user.id,
          department: 'stale',
          capabilities: { roles: ['manager'] },
        },
      },
    } as never);

    expect(result).toEqual({
      id: user.id,
      department: 'Executive',
      capabilities: { roles: ['manager'] },
    });
  });

  it('keeps non-persisted capability principals supported', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const resolver = new CaslUserContextResolver({
      get em() {
        return { findOne };
      },
    } as never, ['sessionUser']);

    const result = await resolver.resolve({
      request: {
        sessionUser: {
          id: 'admin-1',
          department: 'platform',
          capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
        },
      },
    } as never);

    expect(result).toEqual({
      id: 'admin-1',
      department: 'platform',
      capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
    });
  });
});
