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


/*
 * Seed script for the users-api CASL authorization tables.
 *
 * Run with:  pnpm db:seed
 *
 * Runs pending migrations first (idempotent), then inserts seed data
 * for capabilities, roles, users, role assignments, and per-user
 * overrides that exercise complex authorization scenarios:
 *
 *   1. Admin with unrestricted access
 *   2. User-manager scoped to own tenant (can manage users, but cannot delete)
 *   3. Self user who can only update their own profile
 *   4. Viewer with read-only access and field restrictions
 *   5. Multi-role user (viewer + self) demonstrating role merging
 *   6. Support agent with department-scoped access and field-restricted updates
 *   7. Per-user additional capability (viewer promoted to create users)
 */

import { createClient } from '@libsql/client';
import { uuidv7 } from '@nestjs-pipeline/core';
import { migrate } from './migrate';

process.loadEnvFile();
const client = createClient({
  url: process.env.DATABASE_URL ?? 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function seed() {
  // ── Ensure schema is up to date ───────────────────────────────────────
  const applied = await migrate(client);
  if (applied > 0) {
    console.log(`Applied ${applied} migration(s) before seeding.`);
  }

  // ── Generate UUIDv7 primary keys ──────────────────────────────────────
  const cap = {
    adminManage: uuidv7(),
    userRead: uuidv7(),
    userCreate: uuidv7(),
    userUpdate: uuidv7(),
    userDelete: uuidv7(),
    tenantManage: uuidv7(),
    denyDelete: uuidv7(),
    selfUpdate: uuidv7(),
    selfRead: uuidv7(),
    viewerRead: uuidv7(),
    denyEmailUpdate: uuidv7(),
    deptRead: uuidv7(),
    deptUpdate: uuidv7(),
    denyDeleteSupport: uuidv7(),
  };

  const role = {
    admin: uuidv7(),
    userManager: uuidv7(),
    self: uuidv7(),
    viewer: uuidv7(),
    supportAgent: uuidv7(),
  };

  const user = {
    alice: uuidv7(),
    bob: uuidv7(),
    carol: uuidv7(),
    dave: uuidv7(),
    eve: uuidv7(),
    frank: uuidv7(),
    grace: uuidv7(),
    vince: uuidv7(),
  };

  // ── Capabilities ──────────────────────────────────────────────────────────

  await client.batch(
    [
      // Wildcard — admin
      `INSERT OR IGNORE INTO capabilities (id, subject, action)
         VALUES ('${cap.adminManage}', 'all', 'manage')`,

      // User CRUD (unrestricted)
      `INSERT OR IGNORE INTO capabilities (id, subject, action)
         VALUES ('${cap.userRead}', 'User', 'read')`,
      `INSERT OR IGNORE INTO capabilities (id, subject, action)
         VALUES ('${cap.userCreate}', 'User', 'create')`,
      `INSERT OR IGNORE INTO capabilities (id, subject, action)
         VALUES ('${cap.userUpdate}', 'User', 'update')`,
      `INSERT OR IGNORE INTO capabilities (id, subject, action)
         VALUES ('${cap.userDelete}', 'User', 'delete')`,

      // User CRUD — tenant-scoped
      `INSERT OR IGNORE INTO capabilities (id, subject, action, conditions)
         VALUES ('${cap.tenantManage}', 'User', 'manage', '{"tenantId":"$\{sessionUser.tenantId}"}')`,

      // User — deny delete (even within own tenant)
      `INSERT OR IGNORE INTO capabilities (id, subject, action, inverted, reason)
         VALUES ('${cap.denyDelete}', 'User', 'delete', 1, 'User managers cannot delete users')`,

      // User — self: update only own profile username
      `INSERT OR IGNORE INTO capabilities (id, subject, action, conditions, fields)
         VALUES ('${cap.selfUpdate}', 'User', 'update', '{"id":"$\{sessionUser.id}"}', 'username')`,

      // User — self: read only own profile
      `INSERT OR IGNORE INTO capabilities (id, subject, action, conditions)
         VALUES ('${cap.selfRead}', 'User', 'read', '{"id":"$\{sessionUser.id}"}')`,

      // User — read with field restrictions (viewer)
      `INSERT OR IGNORE INTO capabilities (id, subject, action, fields)
         VALUES ('${cap.viewerRead}', 'User', 'read', 'id,username,email')`,

      // User — deny update email field
      `INSERT OR IGNORE INTO capabilities (id, subject, action, conditions, inverted, reason, fields)
         VALUES ('${cap.denyEmailUpdate}', 'User', 'update', '{"tenantId":"$\{sessionUser.tenantId}"}', 1,
                 'Cannot modify email addresses', 'email')`,

      // User — department-scoped read (support agent)
      `INSERT OR IGNORE INTO capabilities (id, subject, action, conditions)
         VALUES ('${cap.deptRead}', 'User', 'read', '{"department":"$\{sessionUser.department}"}')`,

      // User — department-scoped update with field restriction
      `INSERT OR IGNORE INTO capabilities (id, subject, action, conditions, fields)
         VALUES ('${cap.deptUpdate}', 'User', 'update', '{"department":"$\{sessionUser.department}"}', 'username')`,

      // User — deny delete for support agents
      `INSERT OR IGNORE INTO capabilities (id, subject, action, inverted, reason)
         VALUES ('${cap.denyDeleteSupport}', 'User', 'delete', 1, 'Support agents cannot delete users')`,
    ],
    'write',
  );

  // ── Roles ───────────────────────────────────────────────────────────────

  await client.batch(
    [
      `INSERT OR IGNORE INTO roles (id, name) VALUES ('${role.admin}', 'admin')`,
      `INSERT OR IGNORE INTO roles (id, name) VALUES ('${role.userManager}', 'user-manager')`,
      `INSERT OR IGNORE INTO roles (id, name) VALUES ('${role.self}', 'self')`,
      `INSERT OR IGNORE INTO roles (id, name) VALUES ('${role.viewer}', 'viewer')`,
      `INSERT OR IGNORE INTO roles (id, name) VALUES ('${role.supportAgent}', 'support-agent')`,
    ],
    'write',
  );

  // ── Role ↔ Capability assignments ─────────────────────────────────────

  await client.batch(
    [
      // admin → full access
      `INSERT OR IGNORE INTO role_capabilities (role_id, capability_id)
         VALUES ('${role.admin}', '${cap.adminManage}')`,

      // user-manager → tenant-scoped manage + deny delete + deny email updates
      `INSERT OR IGNORE INTO role_capabilities (role_id, capability_id)
         VALUES ('${role.userManager}', '${cap.tenantManage}')`,
      `INSERT OR IGNORE INTO role_capabilities (role_id, capability_id)
         VALUES ('${role.userManager}', '${cap.denyDelete}')`,
      `INSERT OR IGNORE INTO role_capabilities (role_id, capability_id)
         VALUES ('${role.userManager}', '${cap.denyEmailUpdate}')`,

      // self → update own profile + read own profile
      `INSERT OR IGNORE INTO role_capabilities (role_id, capability_id)
         VALUES ('${role.self}', '${cap.selfUpdate}')`,
      `INSERT OR IGNORE INTO role_capabilities (role_id, capability_id)
         VALUES ('${role.self}', '${cap.selfRead}')`,

      // viewer → read users (field-restricted: id, username, email)
      `INSERT OR IGNORE INTO role_capabilities (role_id, capability_id)
         VALUES ('${role.viewer}', '${cap.viewerRead}')`,

      // support-agent → department-scoped read + field-restricted update + deny delete
      `INSERT OR IGNORE INTO role_capabilities (role_id, capability_id)
         VALUES ('${role.supportAgent}', '${cap.deptRead}')`,
      `INSERT OR IGNORE INTO role_capabilities (role_id, capability_id)
         VALUES ('${role.supportAgent}', '${cap.deptUpdate}')`,
      `INSERT OR IGNORE INTO role_capabilities (role_id, capability_id)
         VALUES ('${role.supportAgent}', '${cap.denyDeleteSupport}')`,
    ],
    'write',
  );

  // ── Users ─────────────────────────────────────────────────────────────
  // Diverse users across two tenants and multiple departments.

  const now = Date.now();
  await client.batch(
    [
      // Tenant A — engineering
      `INSERT OR IGNORE INTO users (id, username, email, tenant_id, department, created_at, updated_at)
         VALUES ('${user.alice}', 'alice_admin', 'alice@acme.io', 'tenant-a', 'engineering', ${now}, ${now})`,

      // Tenant A — engineering (user-manager)
      `INSERT OR IGNORE INTO users (id, username, email, tenant_id, department, created_at, updated_at)
         VALUES ('${user.bob}', 'bob_manager', 'bob@acme.io', 'tenant-a', 'engineering', ${now}, ${now})`,

      // Tenant A — marketing (self only)
      `INSERT OR IGNORE INTO users (id, username, email, tenant_id, department, created_at, updated_at)
         VALUES ('${user.carol}', 'carol_user', 'carol@acme.io', 'tenant-a', 'marketing', ${now}, ${now})`,

      // Tenant A — marketing (viewer)
      `INSERT OR IGNORE INTO users (id, username, email, tenant_id, department, created_at, updated_at)
         VALUES ('${user.dave}', 'dave_viewer', 'dave@acme.io', 'tenant-a', 'marketing', ${now}, ${now})`,

      // Tenant B — support (multi-role: viewer + self)
      `INSERT OR IGNORE INTO users (id, username, email, tenant_id, department, created_at, updated_at)
         VALUES ('${user.eve}', 'eve_multirole', 'eve@globex.io', 'tenant-b', 'support', ${now}, ${now})`,

      // Tenant B — support (support-agent)
      `INSERT OR IGNORE INTO users (id, username, email, tenant_id, department, created_at, updated_at)
         VALUES ('${user.frank}', 'frank_support', 'frank@globex.io', 'tenant-b', 'support', ${now}, ${now})`,

      // Tenant B — engineering (user-manager)
      `INSERT OR IGNORE INTO users (id, username, email, tenant_id, department, created_at, updated_at)
         VALUES ('${user.grace}', 'grace_limited', 'grace@globex.io', 'tenant-b', 'engineering', ${now}, ${now})`,

      // Tenant B — marketing (viewer only, no self)
      `INSERT OR IGNORE INTO users (id, username, email, tenant_id, department, created_at, updated_at)
         VALUES ('${user.vince}', 'vince_viewer', 'vince@globex.io', 'tenant-b', 'marketing', ${now}, ${now})`,
    ],
    'write',
  );

  // ── User ↔ Role assignments ───────────────────────────────────────────

  await client.batch(
    [
      // Alice → admin + self
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.alice}', '${role.admin}')`,
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.alice}', '${role.self}')`,

      // Bob → user-manager + self
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.bob}', '${role.userManager}')`,
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.bob}', '${role.self}')`,

      // Carol → self (own profile only)
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.carol}', '${role.self}')`,

      // Dave → viewer + self
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.dave}', '${role.viewer}')`,
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.dave}', '${role.self}')`,

      // Eve → viewer + self (multi-role merge: can read all + update own)
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.eve}', '${role.viewer}')`,
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.eve}', '${role.self}')`,

      // Frank → support-agent + self
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.frank}', '${role.supportAgent}')`,
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.frank}', '${role.self}')`,

      // Grace → user-manager + self
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.grace}', '${role.userManager}')`,
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.grace}', '${role.self}')`,

      // Vince → viewer only (no self)
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.vince}', '${role.viewer}')`,
    ],
    'write',
  );

  // ── Per-user overrides ────────────────────────────────────────────────

  await client.batch(
    [
      // Dave (viewer) is additionally granted 'User|create' — promoted viewer
      `INSERT OR IGNORE INTO user_additional_capabilities (user_id, capability_id)
         VALUES ('${user.dave}', '${cap.userCreate}')`,

    ],
    'write',
  );

  console.log(
    'Seed complete — 7 users, 5 roles, 13 capabilities, 1 per-user override',
  );
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => client.close());
