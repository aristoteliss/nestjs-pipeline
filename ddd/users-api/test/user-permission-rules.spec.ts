/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: placeholders are data */
import { subject as caslSubject } from '@casl/ability';
import type { EntityManager } from '@mikro-orm/core';
import {
  type AppAbility,
  buildAbility,
  type Capability,
  normalizeCapability,
  parseCapabilityString,
  serializeCapability,
} from '@nestjs-pipeline/casl';
import { stableStringify } from '@nestjs-pipeline/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GetUserCapabilitiesQuery } from '../src/auths/cqrs/queries/get-user-capabilities.query';
import { CaslPermissionSource } from '../src/auths/persistence/casl-permission.source';
import { GetUserCapabilitiesQueryRepository } from '../src/auths/persistence/get-user-capabilities.query-repository';
import { UserPermissionRulesReader } from '../src/auths/persistence/user-permission-rules.reader';
import { UserPermissionsProjector } from '../src/auths/persistence/user-permissions.projector';
import { sessionUserStore } from '../src/common/context/session-user.store';
import { UserPermissionRule } from '../src/persistence/entities/user-permission-rule.entity';
import { UserRole } from '../src/persistence/entities/user-role.entity';
import { GetRolesCapabilitiesQueryRepository } from '../src/roles/persistence/get-roles-capabilities.query-repository';
import {
  FIRST_MIGRATION,
  fixtures,
  type MigratedDb,
  migratedDb,
} from './support/permission-rules-db';

const id = (suffix: string) => `01990000-0000-7000-8000-000000000${suffix}`;
const U1 = id('a01');
const U2 = id('a02');
const U3 = id('a03');
const ROLE_A = id('b01');
const ROLE_B = id('b02');
const C1 = id('c01');
const C2 = id('c02');
const C3 = id('c03');
const C4 = id('c04');
const C5 = id('c05');
const C6 = id('c06');

/**
 * Role `ROLE_A` is named `zeta` and `ROLE_B` `alpha`, so ordering by name and by
 * id disagree. Both roles grant the identical rule `C1`.
 */
async function seedFixtures(db: MigratedDb): Promise<void> {
  const f = fixtures(db);
  await f.user(U1, 'engineering');
  await f.user(U2, 'sales');
  await f.user(U3, 'engineering');
  await f.role(ROLE_A, 'zeta');
  await f.role(ROLE_B, 'alpha');
  await f.capability(C1, 'User', 'read', {
    conditions: '{"department":"${user.department}"}',
  });
  await f.capability(C2, 'User', 'update', { fields: 'username' });
  await f.capability(C3, 'User', 'read', {
    fields: 'email',
    inverted: true,
    reason: 'no emails',
  });
  await f.capability(C4, 'Role', 'read');
  await f.capability(C5, 'User', 'delete');
  await f.capability(C6, 'Role', 'update', {
    conditions: '{"name":"alpha"}',
    fields: 'name',
  });
  await f.grant(ROLE_A, C1);
  await f.grant(ROLE_A, C3);
  await f.grant(ROLE_B, C1);
  await f.grant(ROLE_B, C2);
  await f.assign(U1, ROLE_B);
  await f.assign(U1, ROLE_A);
  await f.additional(U1, C4);
  await f.deny(U1, C5);
  await f.assign(U3, ROLE_B);
  await f.additional(U3, C6);
}

const projector = new UserPermissionsProjector();

function rebuild(db: MigratedDb, userIds: string[]): Promise<void> {
  return db.em().transactional((em) => projector.rebuild(em, userIds));
}

async function storedRows(db: MigratedDb, userId: string) {
  return db
    .em()
    .find(
      UserPermissionRule,
      { userId },
      { orderBy: { position: 'asc' }, disableIdentityMap: true },
    );
}

/** The rule set computed directly from the assignment tables, in any order. */
async function sourceTableRules(
  em: EntityManager,
  userId: string,
): Promise<Capability[]> {
  const store = { em } as never;
  const assignments = await new GetUserCapabilitiesQueryRepository(store).find(
    new GetUserCapabilitiesQuery({ userId }),
  );
  const roles = await new GetRolesCapabilitiesQueryRepository(store).getRoles(
    assignments.roles,
  );
  return [
    ...roles.flatMap((role) => role.capabilities.map(normalizeCapability)),
    ...(assignments.additionalCapabilities ?? []).map(normalizeCapability),
    ...(assignments.deniedCapabilities ?? []).map((capability) => ({
      ...normalizeCapability(capability),
      inverted: true,
    })),
  ];
}

async function materializedInput(em: EntityManager, userId: string) {
  const input = await sessionUserStore.run(
    { id: userId, principalType: 'user', tenant: 'tenant' },
    () =>
      new CaslPermissionSource(
        { em } as never,
        new UserPermissionRulesReader({ em } as never),
      ).load(),
  );
  if (!input) throw new Error(`no permission input for ${userId}`);
  return input;
}

function ruleMultiset(ability: AppAbility, inverted: boolean): string[] {
  return ability.rules
    .filter((rule) => Boolean(rule.inverted) === inverted)
    .map((rule) => stableStringify(rule))
    .sort();
}

function probeMatrix(ability: AppAbility, principalId: string): boolean[] {
  const results: boolean[] = [];
  for (const action of ['read', 'update', 'delete', 'create', 'manage']) {
    for (const [type, attributes] of [
      ['User', { id: principalId, department: 'engineering' }],
      ['User', { id: 'someone', department: 'sales' }],
      ['Role', { name: 'alpha' }],
      ['Role', { name: 'zeta' }],
    ] as const) {
      const entity = caslSubject(type, { ...attributes }) as unknown as string;
      for (const field of [undefined, 'email', 'username', 'name']) {
        results.push(
          field
            ? ability.can(action, entity, field)
            : ability.can(action, entity),
        );
        results.push(
          field ? ability.can(action, type, field) : ability.can(action, type),
        );
      }
    }
  }
  return results;
}

async function expectEquivalent(db: MigratedDb, userId: string) {
  const em = db.em();
  const input = await materializedInput(em, userId);
  const fromSource = buildAbility(
    await sourceTableRules(em, userId),
    input.principal,
  );
  const fromRows = buildAbility(input.rules, input.principal);

  const firstInverted = input.rules.findIndex((rule) => rule.inverted);
  expect(
    firstInverted === -1 ||
      input.rules.slice(firstInverted).every((rule) => rule.inverted),
  ).toBe(true);
  expect(ruleMultiset(fromRows, false)).toEqual(
    ruleMultiset(fromSource, false),
  );
  expect(ruleMultiset(fromRows, true)).toEqual(ruleMultiset(fromSource, true));
  expect(probeMatrix(fromRows, userId)).toEqual(
    probeMatrix(fromSource, userId),
  );
}

describe('Materialized user permission rules', () => {
  let db: MigratedDb;

  beforeEach(async () => {
    db = await migratedDb();
    await seedFixtures(db);
    await rebuild(db, [U1, U2, U3]);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('equivalence with the source tables', () => {
    it.each([
      ['two roles, a shared rule, an additional grant and a denial', U1],
      ['no assignments', U2],
      ['one role and a conditional additional grant', U3],
    ])('grants identically for %s', async (_, userId) => {
      await expectEquivalent(db, userId);
    });

    it.each([
      ['U1', U1],
      ['U2', U2],
      ['U3', U3],
    ])(
      'grants identically from access-token perms and from the database (%s)',
      async (_, userId) => {
        const input = await materializedInput(db.em(), userId);
        const perms = input.rules.map(serializeCapability);
        const fromToken = buildAbility(
          perms.map(parseCapabilityString),
          input.principal,
        );
        const fromDatabase = buildAbility(input.rules, input.principal);

        expect(fromToken.rules).toEqual(fromDatabase.rules);
        expect(probeMatrix(fromToken, userId)).toEqual(
          probeMatrix(fromDatabase, userId),
        );
      },
    );

    it('grants identically for every seeded demo user', async () => {
      const users = (await db.sql('select id from users')) as { id: string }[];
      for (const { id } of users) await expectEquivalent(db, id);
    });
  });

  describe('projector', () => {
    it('writes origin columns in role-id, capability-id, additional, denied order', async () => {
      const rows = await storedRows(db, U1);

      expect(
        rows.map((row) => [
          row.position,
          row.source,
          row.roleId,
          row.capabilityId,
          row.inverted,
        ]),
      ).toEqual([
        [1, 'role', ROLE_A, C1, false],
        [2, 'role', ROLE_A, C3, true],
        [3, 'role', ROLE_B, C1, false],
        [4, 'role', ROLE_B, C2, false],
        [5, 'additional', null, C4, false],
        [6, 'denied', null, C5, true],
      ]);
      expect(rows[0]).toMatchObject({
        subject: 'User',
        action: 'read',
        conditions: '{"department":"${user.department}"}',
      });
      expect(rows[1]).toMatchObject({ fields: 'email', reason: 'no emails' });
    });

    it('always inverts denied rows', async () => {
      const denied = (await storedRows(db, U1)).filter(
        (row) => row.source === 'denied',
      );

      expect(denied).toHaveLength(1);
      expect(denied.every((row) => row.inverted)).toBe(true);
    });

    it('sees an assignment made earlier in the same transaction', async () => {
      await db.em().transactional(async (em) => {
        await em.insert(UserRole, { userId: U2, roleId: ROLE_B });
        await projector.rebuild(em, [U2]);
      });

      expect((await storedRows(db, U2)).map((row) => row.capabilityId)).toEqual(
        [C1, C2],
      );
    });

    it('writes no rows for a user without assignments', async () => {
      expect(await storedRows(db, U2)).toEqual([]);
    });

    it('is idempotent', async () => {
      const before = await storedRows(db, U1);
      await rebuild(db, [U1, U1]);

      expect(await storedRows(db, U1)).toEqual(before);
    });

    it('requires a transaction', async () => {
      await expect(projector.rebuild(db.em(), [U1])).rejects.toThrow(
        /requires a transaction/,
      );
    });

    it('reports no drift after a rebuild', async () => {
      expect(await projector.findDrift(db.em())).toEqual([]);
    });

    it('detects a hand-edited row and a missing row', async () => {
      await db.sql(
        "update user_permission_rules set action = 'manage' where user_id = ? and position = 3",
        [U1],
      );
      await db.sql('delete from user_permission_rules where user_id = ?', [U3]);

      expect(await projector.findDrift(db.em())).toEqual([U1, U3]);
      expect(await projector.findDrift(db.em(), [U3])).toEqual([U3]);
    });

    it('changes no row and reports no drift when a role is renamed', async () => {
      const before = await storedRows(db, U1);
      await db.sql("update roles set name = 'renamed' where id = ?", [ROLE_A]);

      expect(await storedRows(db, U1)).toEqual(before);
      expect(await projector.findDrift(db.em())).toEqual([]);
    });
  });

  describe('foreign-key cascades', () => {
    it('removes exactly the rows of a deleted role and keeps the identical rule of another role', async () => {
      await db.sql('delete from roles where id = ?', [ROLE_A]);

      expect(
        (await storedRows(db, U1)).map((row) => [
          row.position,
          row.roleId,
          row.capabilityId,
        ]),
      ).toEqual([
        [3, ROLE_B, C1],
        [4, ROLE_B, C2],
        [5, null, C4],
        [6, null, C5],
      ]);
      expect(await projector.findDrift(db.em())).toEqual([]);
    });

    it('removes the rows of a deleted capability', async () => {
      await db.sql('delete from capabilities where id = ?', [C1]);

      const rows = await storedRows(db, U1);
      expect(rows.map((row) => row.capabilityId)).toEqual([C3, C2, C4, C5]);
      expect(await projector.findDrift(db.em())).toEqual([]);
    });

    it('removes the rows of a deleted user', async () => {
      await db.sql('delete from users where id = ?', [U1]);

      expect(await storedRows(db, U1)).toEqual([]);
    });
  });
});

describe('Upgrading an existing database', () => {
  let db: MigratedDb;

  afterEach(async () => {
    await db?.close();
  });

  it('backfills rules that match the source tables and authorize as before', async () => {
    db = await migratedDb({ to: FIRST_MIGRATION });
    await seedFixtures(db);
    const before = await sourceTableRules(db.em(), U1);

    await db.orm.migrator.up();

    expect(await projector.findDrift(db.em())).toEqual([]);
    const input = await materializedInput(db.em(), U1);
    const principal = { ...input.principal };
    expect(probeMatrix(buildAbility(input.rules, principal), U1)).toEqual(
      probeMatrix(buildAbility(before, principal), U1),
    );
    for (const userId of [U1, U2, U3]) await expectEquivalent(db, userId);
  });

  it('reverts the rules table on down', async () => {
    db = await migratedDb();

    await db.orm.migrator.down();
    await db.orm.migrator.down();

    const tables = (await db.sql(
      "select name from sqlite_master where type = 'table' and name = 'user_permission_rules'",
    )) as unknown[];
    expect(tables).toEqual([]);
  });
});
