import { describe, expect, it } from 'vitest';
import { Auth } from '../../auths/domain/models/auth.entity';
import { Role } from '../../roles/domain/models/role.entity';
import { User } from '../../users/domain/models/user.entity';

describe('aggregate construction contracts', () => {
  it('creates new aggregates only through semantic creation factories', () => {
    const user = User.create('Alice', 'alice@example.test', 'Engineering');
    const role = Role.create('admin');
    const auth = Auth.create(user.id, 'signed-token');

    expect(user.getUncommittedEvents()).toHaveLength(1);
    expect(role.getUncommittedEvents()).toHaveLength(1);
    expect(auth.getUncommittedEvents()).toHaveLength(1);
  });

  it('rehydrates snapshots without publishing creation events', () => {
    const now = new Date();
    const user = User.fromJSON({
      id: '018f2d5e-4b6a-7b3f-8c1d-2e3f4a5b6c7d',
      username: 'Alice',
      email: 'alice@example.test',
      department: 'Engineering',
      createdAt: now,
      updatedAt: now,
      version: 3,
    });
    const role = Role.fromJSON({
      id: '028f2d5e-4b6a-7b3f-8c1d-2e3f4a5b6c7d',
      name: 'admin',
      createdAt: now,
      updatedAt: now,
      version: 2,
    });
    const auth = Auth.fromJSON({
      id: '038f2d5e-4b6a-7b3f-8c1d-2e3f4a5b6c7d',
      userId: user.id,
      token: 'signed-token',
      createdAt: now,
      updatedAt: now,
    });

    expect(user.getUncommittedEvents()).toHaveLength(0);
    expect(role.getUncommittedEvents()).toHaveLength(0);
    expect(auth.getUncommittedEvents()).toHaveLength(0);
  });
});
