import { SYSTEM_ROLES } from '@common/constants';
import { MikroORM } from '@mikro-orm/libsql';
import { createLibsqlOrmOptions } from '@persistence/libsql-options';
import { Migration20260830000000 } from '@persistence/migrations/Migration20260830000000';
import type { MikroOrmStore } from '@persistence/mikro-orm.store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GetRolesCapabilitiesQueryRepository } from '../src/roles/persistence/get-roles-capabilities.query-repository';

describe('Role provider with real MikroORM persistence', () => {
  let orm: MikroORM;
  let repository: GetRolesCapabilitiesQueryRepository;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...createLibsqlOrmOptions(':memory:'),
      debug: false,
      migrations: {
        migrationsList: [Migration20260830000000],
        snapshot: false,
      },
    });
    await orm.migrator.up();
    // Adapt the real EM to the store boundary; queries and metadata are not mocked.
    repository = new GetRolesCapabilitiesQueryRepository({
      get em() {
        return orm.em.fork();
      },
    } as MikroOrmStore);
  });

  afterAll(async () => {
    await orm?.close(true);
  });

  it('filters by mapped role name and hydrates only its capabilities', async () => {
    const roles = await repository.getRoles([SYSTEM_ROLES.ADMIN]);
    expect(roles).toEqual([
      {
        name: SYSTEM_ROLES.ADMIN,
        capabilities: [
          expect.objectContaining({ action: 'manage', subject: 'all' }),
        ],
      },
    ]);
  });

  it('resolves multiple names without including other roles', async () => {
    const roles = await repository.getRoles([
      SYSTEM_ROLES.ADMIN,
      SYSTEM_ROLES.VIEWER,
    ]);
    expect(roles.map((role) => role.name).sort()).toEqual(
      [SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.VIEWER].sort(),
    );
    expect(
      roles.find((role) => role.name === SYSTEM_ROLES.VIEWER)?.capabilities,
    ).toEqual([expect.objectContaining({ action: 'read', subject: 'User' })]);
  });

  it('returns no roles for an unknown name or an empty list', async () => {
    await expect(repository.getRoles(['unknown-role'])).resolves.toEqual([]);
    await expect(repository.getRoles([])).resolves.toEqual([]);
  });

  it('returns all seeded roles when names are omitted', async () => {
    const roles = await repository.getRoles();
    expect(roles.map((role) => role.name).sort()).toEqual(
      Object.values(SYSTEM_ROLES).sort(),
    );
  });
});
