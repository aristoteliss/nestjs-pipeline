/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { Migration } from '@mikro-orm/migrations';

type SeedIds = {
  roles: Record<
    'admin' | 'userManager' | 'self' | 'viewer' | 'supportAgent',
    string
  >;
  users: Record<
    | 'aliceAdmin'
    | 'bobManager'
    | 'carolUser'
    | 'daveViewer'
    | 'eveMultirole'
    | 'frankSupport'
    | 'graceLimited'
    | 'vinceViewer',
    string
  >;
  capabilities: Record<
    | 'allManage'
    | 'userRead'
    | 'userCreate'
    | 'userUpdate'
    | 'userDelete'
    | 'tenantManageUsers'
    | 'denyDeleteByManager'
    | 'selfUpdateUsername'
    | 'selfRead'
    | 'viewerReadFields'
    | 'denyTenantEmailUpdate'
    | 'supportReadDepartment'
    | 'supportUpdateDepartmentUsername'
    | 'denyDeleteBySupport',
    string
  >;
};

type SeedPair = readonly [string, string];

/**
 * Stable identifiers make this data migration reversible without touching
 * application-created rows. The same IDs are safe to reuse across tenants
 * because every tenant has its own database/schema.
 */
const SEED_IDS: SeedIds = {
  roles: {
    admin: '019de10c-b680-7000-8000-000000000001',
    userManager: '019de10c-b680-7000-8000-000000000002',
    self: '019de10c-b680-7000-8000-000000000003',
    viewer: '019de10c-b680-7000-8000-000000000004',
    supportAgent: '019de10c-b680-7000-8000-000000000005',
  },
  users: {
    aliceAdmin: '019de10c-b680-7000-8000-000000000006',
    bobManager: '019de10c-b680-7000-8000-000000000007',
    carolUser: '019de10c-b680-7000-8000-000000000008',
    daveViewer: '019de10c-b680-7000-8000-000000000009',
    eveMultirole: '019de10c-b680-7000-8000-00000000000a',
    frankSupport: '019de10c-b680-7000-8000-00000000000b',
    graceLimited: '019de10c-b680-7000-8000-00000000000c',
    vinceViewer: '019de10c-b680-7000-8000-00000000000d',
  },
  capabilities: {
    allManage: '019de10c-b680-7000-8000-00000000000e',
    userRead: '019de10c-b680-7000-8000-00000000000f',
    userCreate: '019de10c-b680-7000-8000-000000000010',
    userUpdate: '019de10c-b680-7000-8000-000000000011',
    userDelete: '019de10c-b680-7000-8000-000000000012',
    tenantManageUsers: '019de10c-b680-7000-8000-000000000013',
    denyDeleteByManager: '019de10c-b680-7000-8000-000000000014',
    selfUpdateUsername: '019de10c-b680-7000-8000-000000000015',
    selfRead: '019de10c-b680-7000-8000-000000000016',
    viewerReadFields: '019de10c-b680-7000-8000-000000000017',
    denyTenantEmailUpdate: '019de10c-b680-7000-8000-000000000018',
    supportReadDepartment: '019de10c-b680-7000-8000-000000000019',
    supportUpdateDepartmentUsername: '019de10c-b680-7000-8000-00000000001a',
    denyDeleteBySupport: '019de10c-b680-7000-8000-00000000001b',
  },
};

const ROLE_CAPABILITY_ENTRIES: readonly SeedPair[] = [
  [SEED_IDS.roles.admin, SEED_IDS.capabilities.allManage],
  [SEED_IDS.roles.userManager, SEED_IDS.capabilities.tenantManageUsers],
  [SEED_IDS.roles.userManager, SEED_IDS.capabilities.denyDeleteByManager],
  [SEED_IDS.roles.userManager, SEED_IDS.capabilities.denyTenantEmailUpdate],
  [SEED_IDS.roles.self, SEED_IDS.capabilities.selfUpdateUsername],
  [SEED_IDS.roles.self, SEED_IDS.capabilities.selfRead],
  [SEED_IDS.roles.viewer, SEED_IDS.capabilities.viewerReadFields],
  [SEED_IDS.roles.supportAgent, SEED_IDS.capabilities.supportReadDepartment],
  [
    SEED_IDS.roles.supportAgent,
    SEED_IDS.capabilities.supportUpdateDepartmentUsername,
  ],
  [SEED_IDS.roles.supportAgent, SEED_IDS.capabilities.denyDeleteBySupport],
];

const USER_ROLE_ENTRIES: readonly SeedPair[] = [
  [SEED_IDS.users.aliceAdmin, SEED_IDS.roles.admin],
  [SEED_IDS.users.aliceAdmin, SEED_IDS.roles.self],
  [SEED_IDS.users.bobManager, SEED_IDS.roles.userManager],
  [SEED_IDS.users.bobManager, SEED_IDS.roles.self],
  [SEED_IDS.users.carolUser, SEED_IDS.roles.self],
  [SEED_IDS.users.daveViewer, SEED_IDS.roles.viewer],
  [SEED_IDS.users.daveViewer, SEED_IDS.roles.self],
  [SEED_IDS.users.eveMultirole, SEED_IDS.roles.viewer],
  [SEED_IDS.users.eveMultirole, SEED_IDS.roles.self],
  [SEED_IDS.users.frankSupport, SEED_IDS.roles.supportAgent],
  [SEED_IDS.users.frankSupport, SEED_IDS.roles.self],
  [SEED_IDS.users.graceLimited, SEED_IDS.roles.userManager],
  [SEED_IDS.users.graceLimited, SEED_IDS.roles.self],
  [SEED_IDS.users.vinceViewer, SEED_IDS.roles.viewer],
];

const USER_ADDITIONAL_CAPABILITY_ENTRIES: readonly SeedPair[] = [
  [SEED_IDS.users.daveViewer, SEED_IDS.capabilities.userCreate],
];

export class Migration20260501010000 extends Migration {
  private readonly seedTenant = this.resolveSeedTenant();

  override async up(): Promise<void> {
    const ids = SEED_IDS;

    this.seedRoles(ids);
    this.seedUsers(ids);
    this.seedCapabilities(ids);
    this.seedRoleCapabilities();
    this.seedUserRoles();
    this.seedUserOverrides();
  }

  override async down(): Promise<void> {
    this.deleteSeedPairs(
      'user_additional_capabilities',
      'user_id',
      'capability_id',
      USER_ADDITIONAL_CAPABILITY_ENTRIES,
    );
    this.deleteSeedPairs('user_roles', 'user_id', 'role_id', USER_ROLE_ENTRIES);
    this.deleteSeedPairs(
      'role_capabilities',
      'role_id',
      'capability_id',
      ROLE_CAPABILITY_ENTRIES,
    );
    this.deleteSeedIds('capabilities', Object.values(SEED_IDS.capabilities));
    this.deleteSeedIds('users', Object.values(SEED_IDS.users));
    this.deleteSeedIds('roles', Object.values(SEED_IDS.roles));
  }

  private resolveSeedTenant(): string {
    const candidate = (process.env.SEED_TENANT ?? 'default').trim();
    return candidate.length > 0 ? candidate : 'default';
  }

  private tenantToken(): string {
    const normalized = this.seedTenant.toLowerCase();
    const safe = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return safe.length > 0 ? safe : 'default';
  }

  private seedRoles(ids: SeedIds): void {
    const now = Date.now();

    const roles: Array<[string, string]> = [
      [ids.roles.admin, 'admin'],
      [ids.roles.userManager, 'user-manager'],
      [ids.roles.self, 'self'],
      [ids.roles.viewer, 'viewer'],
      [ids.roles.supportAgent, 'support-agent'],
    ];

    for (const [id, name] of roles) {
      this.addSql(
        `insert into roles (id, name, created_at, updated_at) values ('${id}', '${name}', ${now}, ${now}) on conflict (id) do nothing;`,
      );
    }
  }

  private seedUsers(ids: SeedIds): void {
    const now = Date.now();
    const tenantToken = this.tenantToken();

    const users: Array<[string, string, string, string]> = [
      [
        ids.users.aliceAdmin,
        `alice_${tenantToken}`,
        `alice+${tenantToken}@seed.local`,
        'engineering',
      ],
      [
        ids.users.bobManager,
        `bob_${tenantToken}`,
        `bob+${tenantToken}@seed.local`,
        'engineering',
      ],
      [
        ids.users.carolUser,
        `carol_${tenantToken}`,
        `carol+${tenantToken}@seed.local`,
        'marketing',
      ],
      [
        ids.users.daveViewer,
        `dave_${tenantToken}`,
        `dave+${tenantToken}@seed.local`,
        'marketing',
      ],
      [
        ids.users.eveMultirole,
        `eve_${tenantToken}`,
        `eve+${tenantToken}@seed.local`,
        'support',
      ],
      [
        ids.users.frankSupport,
        `frank_${tenantToken}`,
        `frank+${tenantToken}@seed.local`,
        'support',
      ],
      [
        ids.users.graceLimited,
        `grace_${tenantToken}`,
        `grace+${tenantToken}@seed.local`,
        'engineering',
      ],
      [
        ids.users.vinceViewer,
        `vince_${tenantToken}`,
        `vince+${tenantToken}@seed.local`,
        'marketing',
      ],
    ];

    for (const [id, username, email, department] of users) {
      this.addSql(
        `insert into users (id, username, email, department, created_at, updated_at) values ('${id}', '${username}', '${email}', '${department}', ${now}, ${now}) on conflict (id) do nothing;`,
      );
    }
  }

  private seedCapabilities(ids: SeedIds): void {
    const now = Date.now();

    const capabilities: Array<
      [
        string,
        string,
        string,
        string | null,
        number,
        string | null,
        string | null,
      ]
    > = [
      [ids.capabilities.allManage, 'all', 'manage', null, 0, null, null],
      [ids.capabilities.userRead, 'User', 'read', null, 0, null, null],
      [ids.capabilities.userCreate, 'User', 'create', null, 0, null, null],
      [ids.capabilities.userUpdate, 'User', 'update', null, 0, null, null],
      [ids.capabilities.userDelete, 'User', 'delete', null, 0, null, null],
      [
        ids.capabilities.tenantManageUsers,
        'User',
        'manage',
        '{"department":"${user.department}"}',
        0,
        null,
        null,
      ],
      [
        ids.capabilities.denyDeleteByManager,
        'User',
        'delete',
        null,
        1,
        'User managers cannot delete users',
        null,
      ],
      [
        ids.capabilities.selfUpdateUsername,
        'User',
        'update',
        '{"id":"${user.id}"}',
        0,
        null,
        'username',
      ],
      [
        ids.capabilities.selfRead,
        'User',
        'read',
        '{"id":"${user.id}"}',
        0,
        null,
        null,
      ],
      [
        ids.capabilities.viewerReadFields,
        'User',
        'read',
        null,
        0,
        null,
        'id,username,email',
      ],
      [
        ids.capabilities.denyTenantEmailUpdate,
        'User',
        'update',
        '{"department":"${user.department}"}',
        1,
        'Cannot modify email addresses',
        'email',
      ],
      [
        ids.capabilities.supportReadDepartment,
        'User',
        'read',
        '{"department":"${user.department}"}',
        0,
        null,
        null,
      ],
      [
        ids.capabilities.supportUpdateDepartmentUsername,
        'User',
        'update',
        '{"department":"${user.department}"}',
        0,
        null,
        'username',
      ],
      [
        ids.capabilities.denyDeleteBySupport,
        'User',
        'delete',
        null,
        1,
        'Support agents cannot delete users',
        null,
      ],
    ];

    for (const [
      id,
      subject,
      action,
      conditions,
      inverted,
      reason,
      fields,
    ] of capabilities) {
      this.addSql(`
        insert into capabilities (
          id, action, subject, conditions, inverted, reason, fields, created_at, updated_at
        ) values (
          '${id}', '${action}', '${subject}', ${conditions ? `'${conditions}'` : 'null'}, ${inverted}, ${reason ? `'${reason}'` : 'null'}, ${fields ? `'${fields}'` : 'null'}, ${now}, ${now}
        ) on conflict (id) do nothing;
      `);
    }
  }

  private seedRoleCapabilities(): void {
    for (const [roleId, capabilityId] of ROLE_CAPABILITY_ENTRIES) {
      this.addSql(
        `insert into role_capabilities (role_id, capability_id) values ('${roleId}', '${capabilityId}') on conflict (role_id, capability_id) do nothing;`,
      );
    }
  }

  private seedUserRoles(): void {
    for (const [userId, roleId] of USER_ROLE_ENTRIES) {
      this.addSql(
        `insert into user_roles (user_id, role_id) values ('${userId}', '${roleId}') on conflict (user_id, role_id) do nothing;`,
      );
    }
  }

  private seedUserOverrides(): void {
    for (const [userId, capabilityId] of USER_ADDITIONAL_CAPABILITY_ENTRIES) {
      this.addSql(
        `insert into user_additional_capabilities (user_id, capability_id) values ('${userId}', '${capabilityId}') on conflict (user_id, capability_id) do nothing;`,
      );
    }
  }

  private deleteSeedPairs(
    table: string,
    leftColumn: string,
    rightColumn: string,
    entries: readonly SeedPair[],
  ): void {
    for (const [leftId, rightId] of entries) {
      this.addSql(
        `delete from ${table} where ${leftColumn} = '${leftId}' and ${rightColumn} = '${rightId}';`,
      );
    }
  }

  private deleteSeedIds(table: string, ids: readonly string[]): void {
    for (const id of ids) {
      this.addSql(`delete from ${table} where id = '${id}';`);
    }
  }
}
