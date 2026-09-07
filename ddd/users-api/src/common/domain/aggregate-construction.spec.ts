import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Auth } from '../../auths/domain/models/auth.entity';
import { Role } from '../../roles/domain/models/role.entity';
import { User } from '../../users/domain/models/user.entity';

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('aggregate construction contracts', () => {
  it('creates new aggregates through semantic factories and records creation events', () => {
    const user = User.create('Alice', 'alice@example.test', 'Engineering');
    const role = Role.create('admin');
    const auth = Auth.create(user.id, 'signed-token');

    expect(user.getUncommittedEvents()).toHaveLength(1);
    expect(role.getUncommittedEvents()).toHaveLength(1);
    expect(auth.getUncommittedEvents()).toHaveLength(1);
  });

  it('rehydrates snapshots without recording creation events', () => {
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

  it('keeps aggregate constructors private and ORM compatibility casts in persistence only', () => {
    const userSource = source('../../users/domain/models/user.entity.ts');
    const roleSource = source('../../roles/domain/models/role.entity.ts');
    const authSource = source('../../auths/domain/models/auth.entity.ts');

    expect(userSource).toContain('private constructor(snapshot?: UserSnapshot)');
    expect(roleSource).toContain('private constructor(snapshot?: RoleSnapshot)');
    expect(authSource).toContain('private constructor(snapshot?: AuthSnapshot)');

    expect(source('../../persistence/schemas/user.schema.ts')).toContain('class: User as any');
    expect(source('../../persistence/schemas/role.schema.ts')).toContain('class: Role as any');
    expect(source('../../persistence/schemas/auth.schema.ts')).toContain('class: Auth as any');
  });
});
