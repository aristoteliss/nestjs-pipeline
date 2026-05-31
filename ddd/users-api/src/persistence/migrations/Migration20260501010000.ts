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
import { uuidv7 } from '@nestjs-pipeline/core';

type SeedIds = {
  roles: Record<'admin' | 'userManager' | 'self' | 'viewer' | 'supportAgent', string>;
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

export class Migration20260501010000 extends Migration {
  private readonly seedTenant = this.resolveSeedTenant();

  override async up(): Promise<void> {
    const ids = this.createSeedIds();

    this.seedRoles(ids);
    this.seedUsers(ids);
    this.seedCapabilities(ids);
    this.seedRoleCapabilities(ids);
    this.seedUserRoles(ids);
    this.seedUserOverrides(ids);
  }

  override async down(): Promise<void> {
    this.addSql('delete from user_denied_capabilities;');
    this.addSql('delete from user_additional_capabilities;');
    this.addSql('delete from user_roles;');
    this.addSql('delete from role_capabilities;');
    this.addSql('delete from capabilities;');
    this.addSql('delete from auth;');
    this.addSql('delete from users;');
    this.addSql('delete from roles;');
  }

  private createSeedIds(): SeedIds {
    return {
      roles: {
        admin: uuidv7(),
        userManager: uuidv7(),
        self: uuidv7(),
        viewer: uuidv7(),
        supportAgent: uuidv7(),
      },
      users: {
        aliceAdmin: uuidv7(),
        bobManager: uuidv7(),
        carolUser: uuidv7(),
        daveViewer: uuidv7(),
        eveMultirole: uuidv7(),
        frankSupport: uuidv7(),
        graceLimited: uuidv7(),
        vinceViewer: uuidv7(),
      },
      capabilities: {
        allManage: uuidv7(),
        userRead: uuidv7(),
        userCreate: uuidv7(),
        userUpdate: uuidv7(),
        userDelete: uuidv7(),
        tenantManageUsers: uuidv7(),
        denyDeleteByManager: uuidv7(),
        selfUpdateUsername: uuidv7(),
        selfRead: uuidv7(),
        viewerReadFields: uuidv7(),
        denyTenantEmailUpdate: uuidv7(),
        supportReadDepartment: uuidv7(),
        supportUpdateDepartmentUsername: uuidv7(),
        denyDeleteBySupport: uuidv7(),
      },
    };
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
      [ids.users.aliceAdmin, `alice_${tenantToken}`, `alice+${tenantToken}@seed.local`, 'engineering'],
      [ids.users.bobManager, `bob_${tenantToken}`, `bob+${tenantToken}@seed.local`, 'engineering'],
      [ids.users.carolUser, `carol_${tenantToken}`, `carol+${tenantToken}@seed.local`, 'marketing'],
      [ids.users.daveViewer, `dave_${tenantToken}`, `dave+${tenantToken}@seed.local`, 'marketing'],
      [ids.users.eveMultirole, `eve_${tenantToken}`, `eve+${tenantToken}@seed.local`, 'support'],
      [ids.users.frankSupport, `frank_${tenantToken}`, `frank+${tenantToken}@seed.local`, 'support'],
      [ids.users.graceLimited, `grace_${tenantToken}`, `grace+${tenantToken}@seed.local`, 'engineering'],
      [ids.users.vinceViewer, `vince_${tenantToken}`, `vince+${tenantToken}@seed.local`, 'marketing'],
    ];

    for (const [id, username, email, department] of users) {
      this.addSql(
        `insert into users (id, username, email, department, created_at, updated_at) values ('${id}', '${username}', '${email}', '${department}', ${now}, ${now}) on conflict (id) do nothing;`,
      );
    }
  }

  private seedCapabilities(ids: SeedIds): void {
    const now = Date.now();

    const capabilities: Array<[string, string, string, string | null, number, string | null, string | null]> = [
      [ids.capabilities.allManage, 'all', 'manage', null, 0, null, null],
      [ids.capabilities.userRead, 'User', 'read', null, 0, null, null],
      [ids.capabilities.userCreate, 'User', 'create', null, 0, null, null],
      [ids.capabilities.userUpdate, 'User', 'update', null, 0, null, null],
      [ids.capabilities.userDelete, 'User', 'delete', null, 0, null, null],
      [ids.capabilities.tenantManageUsers, 'User', 'manage', '{"department":"${sessionUser.department}"}', 0, null, null],
      [ids.capabilities.denyDeleteByManager, 'User', 'delete', null, 1, 'User managers cannot delete users', null],
      [ids.capabilities.selfUpdateUsername, 'User', 'update', '{"id":"${sessionUser.id}"}', 0, null, 'username'],
      [ids.capabilities.selfRead, 'User', 'read', '{"id":"${sessionUser.id}"}', 0, null, null],
      [ids.capabilities.viewerReadFields, 'User', 'read', null, 0, null, 'id,username,email'],
      [ids.capabilities.denyTenantEmailUpdate, 'User', 'update', '{"department":"${sessionUser.department}"}', 1, 'Cannot modify email addresses', 'email'],
      [ids.capabilities.supportReadDepartment, 'User', 'read', '{"department":"${sessionUser.department}"}', 0, null, null],
      [ids.capabilities.supportUpdateDepartmentUsername, 'User', 'update', '{"department":"${sessionUser.department}"}', 0, null, 'username'],
      [ids.capabilities.denyDeleteBySupport, 'User', 'delete', null, 1, 'Support agents cannot delete users', null],
    ];

    for (const [id, subject, action, conditions, inverted, reason, fields] of capabilities) {
      this.addSql(`
        insert into capabilities (
          id, role_id, action, subject, conditions, inverted, reason, fields, created_at, updated_at
        ) values (
          '${id}', '', '${action}', '${subject}', ${conditions ? `'${conditions}'` : 'null'}, ${inverted}, ${reason ? `'${reason}'` : 'null'}, ${fields ? `'${fields}'` : 'null'}, ${now}, ${now}
        ) on conflict (id) do nothing;
      `);
    }
  }

  private seedRoleCapabilities(ids: SeedIds): void {
    const entries: Array<[string, string]> = [
      [ids.roles.admin, ids.capabilities.allManage],
      [ids.roles.userManager, ids.capabilities.tenantManageUsers],
      [ids.roles.userManager, ids.capabilities.denyDeleteByManager],
      [ids.roles.userManager, ids.capabilities.denyTenantEmailUpdate],
      [ids.roles.self, ids.capabilities.selfUpdateUsername],
      [ids.roles.self, ids.capabilities.selfRead],
      [ids.roles.viewer, ids.capabilities.viewerReadFields],
      [ids.roles.supportAgent, ids.capabilities.supportReadDepartment],
      [ids.roles.supportAgent, ids.capabilities.supportUpdateDepartmentUsername],
      [ids.roles.supportAgent, ids.capabilities.denyDeleteBySupport],
    ];

    for (const [roleId, capabilityId] of entries) {
      this.addSql(
        `insert into role_capabilities (role_id, capability_id) values ('${roleId}', '${capabilityId}') on conflict (role_id, capability_id) do nothing;`,
      );
    }
  }

  private seedUserRoles(ids: SeedIds): void {
    const entries: Array<[string, string]> = [
      [ids.users.aliceAdmin, ids.roles.admin],
      [ids.users.aliceAdmin, ids.roles.self],
      [ids.users.bobManager, ids.roles.userManager],
      [ids.users.bobManager, ids.roles.self],
      [ids.users.carolUser, ids.roles.self],
      [ids.users.daveViewer, ids.roles.viewer],
      [ids.users.daveViewer, ids.roles.self],
      [ids.users.eveMultirole, ids.roles.viewer],
      [ids.users.eveMultirole, ids.roles.self],
      [ids.users.frankSupport, ids.roles.supportAgent],
      [ids.users.frankSupport, ids.roles.self],
      [ids.users.graceLimited, ids.roles.userManager],
      [ids.users.graceLimited, ids.roles.self],
      [ids.users.vinceViewer, ids.roles.viewer],
    ];

    for (const [userId, roleId] of entries) {
      this.addSql(
        `insert into user_roles (user_id, role_id) values ('${userId}', '${roleId}') on conflict (user_id, role_id) do nothing;`,
      );
    }
  }

  private seedUserOverrides(ids: SeedIds): void {
    this.addSql(
      `insert into user_additional_capabilities (user_id, capability_id) values ('${ids.users.daveViewer}', '${ids.capabilities.userCreate}') on conflict (user_id, capability_id) do nothing;`,
    );
  }
}
