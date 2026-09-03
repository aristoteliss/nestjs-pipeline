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

import { SYSTEM_ROLES } from '@common/constants';
import { Migration } from '@mikro-orm/migrations';

const IDS = {
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
    carolSelf: '019de10c-b680-7000-8000-000000000008',
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
    departmentManageUsers: '019de10c-b680-7000-8000-000000000013',
    denyDeleteByManager: '019de10c-b680-7000-8000-000000000014',
    selfUpdateUsername: '019de10c-b680-7000-8000-000000000015',
    selfRead: '019de10c-b680-7000-8000-000000000016',
    viewerReadFields: '019de10c-b680-7000-8000-000000000017',
    denyDepartmentEmailUpdate: '019de10c-b680-7000-8000-000000000018',
    supportReadDepartment: '019de10c-b680-7000-8000-000000000019',
    supportUpdateUsername: '019de10c-b680-7000-8000-00000000001a',
    denyDeleteBySupport: '019de10c-b680-7000-8000-00000000001b',
  },
} as const;

function sqlString(value: string | null): string {
  return value === null ? 'null' : `'${value.replaceAll("'", "''")}'`;
}

export class Migration20260830000000 extends Migration {
  override async up(): Promise<void> {
    this.createSchema();
    this.seedDemoData();
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists user_denied_capabilities;');
    this.addSql('drop table if exists user_additional_capabilities;');
    this.addSql('drop table if exists user_roles;');
    this.addSql('drop table if exists role_capabilities;');
    this.addSql('drop table if exists capabilities;');
    this.addSql('drop table if exists auth;');
    this.addSql('drop table if exists roles;');
    this.addSql('drop table if exists users;');
    this.addSql('drop table if exists cache;');
  }

  private createSchema(): void {
    this.addSql(`create table users (
      id varchar(64) not null,
      created_at bigint not null,
      updated_at bigint not null,
      username varchar(255) not null,
      department varchar(255) null,
      email varchar(320) not null,
      primary key (id)
    );`);
    this.addSql('create unique index users_email_unique on users (email);');

    this.addSql(`create table auth (
      id varchar(64) not null,
      created_at bigint not null,
      updated_at bigint not null,
      user_id varchar(64) not null,
      token text not null,
      primary key (id)
    );`);
    this.addSql('create index auth_user_id_idx on auth (user_id);');

    this.addSql(`create table roles (
      id varchar(64) not null,
      created_at bigint not null,
      updated_at bigint not null,
      name varchar(128) not null,
      primary key (id)
    );`);
    this.addSql('create unique index roles_name_unique on roles (name);');

    this.addSql(`create table capabilities (
      id varchar(64) not null,
      created_at bigint not null,
      updated_at bigint not null,
      action varchar(64) not null,
      subject varchar(128) not null,
      conditions text null,
      inverted boolean not null default false,
      reason text null,
      fields text null,
      primary key (id)
    );`);

    this.addSql(`create table role_capabilities (
      role_id varchar(64) not null references roles(id) on delete cascade,
      capability_id varchar(64) not null references capabilities(id) on delete cascade,
      primary key (role_id, capability_id)
    );`);
    this.addSql(`create table user_roles (
      user_id varchar(64) not null references users(id) on delete cascade,
      role_id varchar(64) not null references roles(id) on delete cascade,
      primary key (user_id, role_id)
    );`);
    this.addSql(`create table user_additional_capabilities (
      user_id varchar(64) not null references users(id) on delete cascade,
      capability_id varchar(64) not null references capabilities(id) on delete cascade,
      primary key (user_id, capability_id)
    );`);
    this.addSql(`create table user_denied_capabilities (
      user_id varchar(64) not null references users(id) on delete cascade,
      capability_id varchar(64) not null references capabilities(id) on delete cascade,
      primary key (user_id, capability_id)
    );`);

    this.addSql(`create table cache (
      key varchar(255) not null,
      value text not null,
      expires_at bigint null,
      primary key (key)
    );`);
    this.addSql('create index cache_expires_at_idx on cache (expires_at);');
  }

  private seedDemoData(): void {
    const now = Date.now();
    const tenant = this.tenantToken();

    const roles = [
      [IDS.roles.admin, SYSTEM_ROLES.ADMIN],
      [IDS.roles.userManager, SYSTEM_ROLES.USER_MANAGER],
      [IDS.roles.self, SYSTEM_ROLES.SELF],
      [IDS.roles.viewer, SYSTEM_ROLES.VIEWER],
      [IDS.roles.supportAgent, SYSTEM_ROLES.SUPPORT_AGENT],
    ] as const;
    for (const [id, name] of roles) {
      this.addSql(
        `insert into roles (id, name, created_at, updated_at) values ('${id}', '${name}', ${now}, ${now});`,
      );
    }

    const users = [
      [IDS.users.aliceAdmin, 'alice', 'engineering'],
      [IDS.users.bobManager, 'bob', 'engineering'],
      [IDS.users.carolSelf, 'carol', 'marketing'],
      [IDS.users.daveViewer, 'dave', 'marketing'],
      [IDS.users.eveMultirole, 'eve', 'support'],
      [IDS.users.frankSupport, 'frank', 'support'],
      [IDS.users.graceLimited, 'grace', 'engineering'],
      [IDS.users.vinceViewer, 'vince', 'marketing'],
    ] as const;
    for (const [id, name, department] of users) {
      this.addSql(
        `insert into users (id, username, email, department, created_at, updated_at) values (` +
          `'${id}', '${name}_${tenant}', '${name}+${tenant}@seed.local', '${department}', ${now}, ${now});`,
      );
    }

    const capabilities: ReadonlyArray<
      readonly [
        string,
        string,
        string,
        string | null,
        boolean,
        string | null,
        string | null,
      ]
    > = [
      [IDS.capabilities.allManage, 'all', 'manage', null, false, null, null],
      [IDS.capabilities.userRead, 'User', 'read', null, false, null, null],
      [IDS.capabilities.userCreate, 'User', 'create', null, false, null, null],
      [IDS.capabilities.userUpdate, 'User', 'update', null, false, null, null],
      [IDS.capabilities.userDelete, 'User', 'delete', null, false, null, null],
      [
        IDS.capabilities.departmentManageUsers,
        'User',
        'manage',
        '{"department":"${user.department}"}',
        false,
        null,
        null,
      ],
      [
        IDS.capabilities.denyDeleteByManager,
        'User',
        'delete',
        null,
        true,
        'User managers cannot delete users',
        null,
      ],
      [
        IDS.capabilities.selfUpdateUsername,
        'User',
        'update',
        '{"id":"${user.id}"}',
        false,
        null,
        'username',
      ],
      [
        IDS.capabilities.selfRead,
        'User',
        'read',
        '{"id":"${user.id}"}',
        false,
        null,
        null,
      ],
      [
        IDS.capabilities.viewerReadFields,
        'User',
        'read',
        null,
        false,
        null,
        'id,username,email',
      ],
      [
        IDS.capabilities.denyDepartmentEmailUpdate,
        'User',
        'update',
        '{"department":"${user.department}"}',
        true,
        'Cannot modify email addresses',
        'email',
      ],
      [
        IDS.capabilities.supportReadDepartment,
        'User',
        'read',
        '{"department":"${user.department}"}',
        false,
        null,
        null,
      ],
      [
        IDS.capabilities.supportUpdateUsername,
        'User',
        'update',
        '{"department":"${user.department}"}',
        false,
        null,
        'username',
      ],
      [
        IDS.capabilities.denyDeleteBySupport,
        'User',
        'delete',
        null,
        true,
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
      this.addSql(
        `insert into capabilities (id, action, subject, conditions, inverted, reason, fields, created_at, updated_at) values (` +
          `'${id}', '${action}', '${subject}', ${sqlString(conditions)}, ${inverted ? 'true' : 'false'}, ${sqlString(reason)}, ${sqlString(fields)}, ${now}, ${now});`,
      );
    }

    const roleCapabilities = [
      [IDS.roles.admin, IDS.capabilities.allManage],
      [IDS.roles.userManager, IDS.capabilities.departmentManageUsers],
      [IDS.roles.userManager, IDS.capabilities.denyDeleteByManager],
      [IDS.roles.userManager, IDS.capabilities.denyDepartmentEmailUpdate],
      [IDS.roles.self, IDS.capabilities.selfUpdateUsername],
      [IDS.roles.self, IDS.capabilities.selfRead],
      [IDS.roles.viewer, IDS.capabilities.viewerReadFields],
      [IDS.roles.supportAgent, IDS.capabilities.supportReadDepartment],
      [IDS.roles.supportAgent, IDS.capabilities.supportUpdateUsername],
      [IDS.roles.supportAgent, IDS.capabilities.denyDeleteBySupport],
    ] as const;
    for (const [roleId, capabilityId] of roleCapabilities) {
      this.addSql(
        `insert into role_capabilities (role_id, capability_id) values ('${roleId}', '${capabilityId}');`,
      );
    }

    const userRoles = [
      [IDS.users.aliceAdmin, IDS.roles.admin],
      [IDS.users.bobManager, IDS.roles.userManager],
      [IDS.users.carolSelf, IDS.roles.self],
      [IDS.users.daveViewer, IDS.roles.viewer],
      [IDS.users.eveMultirole, IDS.roles.viewer],
      [IDS.users.eveMultirole, IDS.roles.self],
      [IDS.users.frankSupport, IDS.roles.supportAgent],
      [IDS.users.graceLimited, IDS.roles.userManager],
      [IDS.users.vinceViewer, IDS.roles.viewer],
    ] as const;
    for (const [userId, roleId] of userRoles) {
      this.addSql(
        `insert into user_roles (user_id, role_id) values ('${userId}', '${roleId}');`,
      );
    }

    this.addSql(
      `insert into user_additional_capabilities (user_id, capability_id) values (` +
        `'${IDS.users.vinceViewer}', '${IDS.capabilities.userCreate}');`,
    );
    this.addSql(
      `insert into user_denied_capabilities (user_id, capability_id) values (` +
        `'${IDS.users.graceLimited}', '${IDS.capabilities.userRead}');`,
    );
  }

  private tenantToken(): string {
    const raw = (process.env.SEED_TENANT ?? 'tenant').trim().toLowerCase();
    const token = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return token || 'tenant';
  }
}
