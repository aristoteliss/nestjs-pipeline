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
 *   3. Self-service user who can only update their own profile
 *   4. Viewer with read-only access and field restrictions
 *   5. Multi-role user (viewer + self-service) demonstrating role merging
 *   6. Support agent with department-scoped access and field-restricted updates
 *   7. Per-user additional capability (viewer promoted to create users)
 *   8. Per-user denied capability (user-manager blocked from updating emails)
 */

import { createClient } from '@libsql/client';
import { uuidv7 } from '@nestjs-pipeline/core';
import { migrate } from './migrate';

process.loadEnvFile();
const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
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
    selfService: uuidv7(),
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
         VALUES ('${cap.tenantManage}', 'User', 'manage', '{"tenantId":"$\{user.tenantId}"}')`,

      // User — deny delete (even within own tenant)
      `INSERT OR IGNORE INTO capabilities (id, subject, action, inverted, reason)
         VALUES ('${cap.denyDelete}', 'User', 'delete', 1, 'User managers cannot delete users')`,

      // User — self-service: update only own profile
      `INSERT OR IGNORE INTO capabilities (id, subject, action, conditions)
         VALUES ('${cap.selfUpdate}', 'User', 'update', '{"id":"$\{user.id}"}')`,

      // User — self-service: read only own profile
      `INSERT OR IGNORE INTO capabilities (id, subject, action, conditions)
         VALUES ('${cap.selfRead}', 'User', 'read', '{"id":"$\{user.id}"}')`,

      // User — read with field restrictions (viewer)
      `INSERT OR IGNORE INTO capabilities (id, subject, action, fields)
         VALUES ('${cap.viewerRead}', 'User', 'read', 'id,username,email')`,

      // User — deny update email field (override for specific user)
      `INSERT OR IGNORE INTO capabilities (id, subject, action, conditions, inverted, reason, fields)
         VALUES ('${cap.denyEmailUpdate}', 'User', 'update', '{"tenantId":"$\{user.tenantId}"}', 1,
                 'Cannot modify email addresses', 'email')`,

      // User — department-scoped read (support agent)
      `INSERT OR IGNORE INTO capabilities (id, subject, action, conditions)
         VALUES ('${cap.deptRead}', 'User', 'read', '{"department":"$\{user.department}"}')`,

      // User — department-scoped update with field restriction
      `INSERT OR IGNORE INTO capabilities (id, subject, action, conditions, fields)
         VALUES ('${cap.deptUpdate}', 'User', 'update', '{"department":"$\{user.department}"}', 'username')`,

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
      `INSERT OR IGNORE INTO roles (id, name) VALUES ('${role.selfService}', 'self-service')`,
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

      // user-manager → tenant-scoped manage + deny delete
      `INSERT OR IGNORE INTO role_capabilities (role_id, capability_id)
         VALUES ('${role.userManager}', '${cap.tenantManage}')`,
      `INSERT OR IGNORE INTO role_capabilities (role_id, capability_id)
         VALUES ('${role.userManager}', '${cap.denyDelete}')`,

      // self-service → update own profile + read own profile
      `INSERT OR IGNORE INTO role_capabilities (role_id, capability_id)
         VALUES ('${role.selfService}', '${cap.selfUpdate}')`,
      `INSERT OR IGNORE INTO role_capabilities (role_id, capability_id)
         VALUES ('${role.selfService}', '${cap.selfRead}')`,

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

      // Tenant A — marketing (self-service only)
      `INSERT OR IGNORE INTO users (id, username, email, tenant_id, department, created_at, updated_at)
         VALUES ('${user.carol}', 'carol_user', 'carol@acme.io', 'tenant-a', 'marketing', ${now}, ${now})`,

      // Tenant A — marketing (viewer)
      `INSERT OR IGNORE INTO users (id, username, email, tenant_id, department, created_at, updated_at)
         VALUES ('${user.dave}', 'dave_viewer', 'dave@acme.io', 'tenant-a', 'marketing', ${now}, ${now})`,

      // Tenant B — support (multi-role: viewer + self-service)
      `INSERT OR IGNORE INTO users (id, username, email, tenant_id, department, created_at, updated_at)
         VALUES ('${user.eve}', 'eve_multirole', 'eve@globex.io', 'tenant-b', 'support', ${now}, ${now})`,

      // Tenant B — support (support-agent)
      `INSERT OR IGNORE INTO users (id, username, email, tenant_id, department, created_at, updated_at)
         VALUES ('${user.frank}', 'frank_support', 'frank@globex.io', 'tenant-b', 'support', ${now}, ${now})`,

      // Tenant B — engineering (user-manager with per-user denied email update)
      `INSERT OR IGNORE INTO users (id, username, email, tenant_id, department, created_at, updated_at)
         VALUES ('${user.grace}', 'grace_limited', 'grace@globex.io', 'tenant-b', 'engineering', ${now}, ${now})`,
    ],
    'write',
  );

  // ── User ↔ Role assignments ───────────────────────────────────────────

  await client.batch(
    [
      // Alice → admin (unrestricted)
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.alice}', '${role.admin}')`,

      // Bob → user-manager (tenant-scoped manage, cannot delete)
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.bob}', '${role.userManager}')`,

      // Carol → self-service (own profile only)
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.carol}', '${role.selfService}')`,

      // Dave → viewer (read-only, field-restricted)
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.dave}', '${role.viewer}')`,

      // Eve → viewer + self-service (multi-role merge: can read all + update own)
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.eve}', '${role.viewer}')`,
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.eve}', '${role.selfService}')`,

      // Frank → support-agent (department-scoped, field-restricted updates)
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.frank}', '${role.supportAgent}')`,

      // Grace → user-manager (same as Bob, but with per-user denial below)
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${user.grace}', '${role.userManager}')`,
    ],
    'write',
  );

  // ── Per-user overrides ────────────────────────────────────────────────

  await client.batch(
    [
      // Dave (viewer) is additionally granted 'User|create' — promoted viewer
      `INSERT OR IGNORE INTO user_additional_capabilities (user_id, capability_id)
         VALUES ('${user.dave}', '${cap.userCreate}')`,

      // Grace (user-manager) is denied updating email fields within her tenant
      `INSERT OR IGNORE INTO user_denied_capabilities (user_id, capability_id)
         VALUES ('${user.grace}', '${cap.denyEmailUpdate}')`,
    ],
    'write',
  );

  console.log(
    'Seed complete — 7 users, 5 roles, 13 capabilities, 2 per-user overrides',
  );
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => client.close());
