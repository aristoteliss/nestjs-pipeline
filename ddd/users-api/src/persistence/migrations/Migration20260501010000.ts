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

  private seedRoles(ids: SeedIds): void {
    const now = "(cast(strftime('%s','now') as integer) * 1000)";

    const roles: Array<[string, string]> = [
      [ids.roles.admin, 'admin'],
      [ids.roles.userManager, 'user-manager'],
      [ids.roles.self, 'self'],
      [ids.roles.viewer, 'viewer'],
      [ids.roles.supportAgent, 'support-agent'],
    ];

    for (const [id, name] of roles) {
      this.addSql(
        `insert or ignore into roles (id, name, created_at, updated_at) values ('${id}', '${name}', ${now}, ${now});`,
      );
    }
  }

  private seedUsers(ids: SeedIds): void {
    const now = "(cast(strftime('%s','now') as integer) * 1000)";

    const users: Array<[string, string, string, string, string]> = [
      [ids.users.aliceAdmin, 'alice_admin', 'alice@acme.io', 'tenant-a', 'engineering'],
      [ids.users.bobManager, 'bob_manager', 'bob@acme.io', 'tenant-a', 'engineering'],
      [ids.users.carolUser, 'carol_user', 'carol@acme.io', 'tenant-a', 'marketing'],
      [ids.users.daveViewer, 'dave_viewer', 'dave@acme.io', 'tenant-a', 'marketing'],
      [ids.users.eveMultirole, 'eve_multirole', 'eve@globex.io', 'tenant-b', 'support'],
      [ids.users.frankSupport, 'frank_support', 'frank@globex.io', 'tenant-b', 'support'],
      [ids.users.graceLimited, 'grace_limited', 'grace@globex.io', 'tenant-b', 'engineering'],
      [ids.users.vinceViewer, 'vince_viewer', 'vince@globex.io', 'tenant-b', 'marketing'],
    ];

    for (const [id, username, email, tenantId, department] of users) {
      this.addSql(
        `insert or ignore into users (id, username, email, tenant_id, department, created_at, updated_at) values ('${id}', '${username}', '${email}', '${tenantId}', '${department}', ${now}, ${now});`,
      );
    }
  }

  private seedCapabilities(ids: SeedIds): void {
    const now = "(cast(strftime('%s','now') as integer) * 1000)";

    const capabilities: Array<[string, string, string, string | null, number, string | null, string | null]> = [
      [ids.capabilities.allManage, 'all', 'manage', null, 0, null, null],
      [ids.capabilities.userRead, 'User', 'read', null, 0, null, null],
      [ids.capabilities.userCreate, 'User', 'create', null, 0, null, null],
      [ids.capabilities.userUpdate, 'User', 'update', null, 0, null, null],
      [ids.capabilities.userDelete, 'User', 'delete', null, 0, null, null],
      [ids.capabilities.tenantManageUsers, 'User', 'manage', '{"tenantId":"${sessionUser.tenantId}"}', 0, null, null],
      [ids.capabilities.denyDeleteByManager, 'User', 'delete', null, 1, 'User managers cannot delete users', null],
      [ids.capabilities.selfUpdateUsername, 'User', 'update', '{"id":"${sessionUser.id}"}', 0, null, 'username'],
      [ids.capabilities.selfRead, 'User', 'read', '{"id":"${sessionUser.id}"}', 0, null, null],
      [ids.capabilities.viewerReadFields, 'User', 'read', null, 0, null, 'id,username,email'],
      [ids.capabilities.denyTenantEmailUpdate, 'User', 'update', '{"tenantId":"${sessionUser.tenantId}"}', 1, 'Cannot modify email addresses', 'email'],
      [ids.capabilities.supportReadDepartment, 'User', 'read', '{"department":"${sessionUser.department}"}', 0, null, null],
      [ids.capabilities.supportUpdateDepartmentUsername, 'User', 'update', '{"department":"${sessionUser.department}"}', 0, null, 'username'],
      [ids.capabilities.denyDeleteBySupport, 'User', 'delete', null, 1, 'Support agents cannot delete users', null],
    ];

    for (const [id, subject, action, conditions, inverted, reason, fields] of capabilities) {
      this.addSql(`
        insert or ignore into capabilities (
          id, role_id, action, subject, conditions, inverted, reason, fields, created_at, updated_at
        ) values (
          '${id}', '', '${action}', '${subject}', ${conditions ? `'${conditions}'` : 'null'}, ${inverted}, ${reason ? `'${reason}'` : 'null'}, ${fields ? `'${fields}'` : 'null'}, ${now}, ${now}
        );
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
        `insert or ignore into role_capabilities (role_id, capability_id) values ('${roleId}', '${capabilityId}');`,
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
        `insert or ignore into user_roles (user_id, role_id) values ('${userId}', '${roleId}');`,
      );
    }
  }

  private seedUserOverrides(ids: SeedIds): void {
    this.addSql(
      `insert or ignore into user_additional_capabilities (user_id, capability_id) values ('${ids.users.daveViewer}', '${ids.capabilities.userCreate}');`,
    );
  }
}
