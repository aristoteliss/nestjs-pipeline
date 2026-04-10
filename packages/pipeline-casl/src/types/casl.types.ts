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

import type { MongoAbility, RawRuleOf } from '@casl/ability';

/**
 * Compact string representation of a capability, optimised for transport
 * in JWTs, cookies, and session stores where payload size matters.
 *
 * Format: `[!]subject|action|conditions[|fields]`
 *
 * Uses CASL's predefined keywords directly:
 * - `all` as subject  → all subjects
 * - `manage` as action → all actions
 * - `*` as conditions → no conditions (unrestricted access)
 * - `*` as fields (or omitted) → all fields (no field-level restriction)
 * - Fields are comma-separated: `title,body,status`
 *
 * Examples:
 * - `Post|manage|*`      → manage all posts (any condition, all fields)
 * - `Post|read|*`        → read any post (all fields)
 * - `Post|update|{"authorId":"${user.id}"}|title,body` → update own post title and body only
 * - `Post|read|*|title,body,status` → read only title, body, and status fields
 * - `all|manage|*`       → manage everything
 * - `!Post|delete|*`     → cannot delete posts (inverted, prefixed with `!`)
 * - `Post|update|{"authorId":"${user.id}","status":{"$in":["draft","review"]}}`
 *     → update own posts only when status is draft or review
 * - `Comment|delete|{"authorId":"${user.id}","createdAt":{"$gte":"${today}"}}`
 *     → delete own comments created today or later
 * - `Document|read|{"tenantId":"${user.tenantId}","visibility":{"$ne":"private"}}`
 *     → read tenant documents that are not private
 * - `Order|update|{"assigneeId":"${user.id}","status":{"$nin":["completed","cancelled"]}}`
 *     → update own orders unless completed or cancelled
 * - `Project|manage|{"members":{"$elemMatch":{"userId":"${user.id}","role":"owner"}}}`
 *     → manage projects where the user is an owner member
 *
 * Use {@link serializeCapability} to collapse a full {@link Capability} into this
 * format, or {@link parseCapabilityString} to expand it back.
 *
 * This type is **not intended for database storage**. In a relational database,
 * store capabilities as rows in a `capabilities` table (see {@link Capability}
 * for the proposed schema). Use `CapabilityString` only when you need to
 * serialise a compact array of rules into a JWT claim, an encrypted cookie,
 * or a session store entry.
 */
export type CapabilityString = string;

/**
 * The **central authorisation entity**. Every permission in the system is
 * ultimately a `Capability` row.
 *
 * Each property maps one-to-one to a database column:
 *
 * | Property     | Column type             | Notes                                                                             |
 * |--------------|-------------------------|-----------------------------------------------------------------------------------|
 * | *(auto)*     | `id` uuid / serial PK   | Surrogate key, not exposed in the TS interface                                    |
 * | `subject`    | text, **indexed**       | The entity type (e.g. `'Post'`, `'Comment'`). Use `'all'` for any subject         |
 * | `action`     | text, **indexed**       | The verb (e.g. `'read'`, `'update'`). Use `'manage'` for any action               |
 * | `conditions` | jsonb, nullable         | UCAST / MongoDB-style filter — evaluated in-memory, no MongoDB needed             |
 * | `inverted`   | boolean, default false  | `true` → this is a deny rule                                                      |
 * | `reason`     | text, nullable          | Human-readable explanation (relevant only when `inverted`)                         |
 * | `fields`     | text[], nullable        | Column-level restrictions (`undefined` = all fields)                               |
 *
 * A composite unique index on `(subject, action, conditions)` avoids duplicates.
 *
 * Because `subject` and `action` are **plain indexed columns**, you can query
 * efficiently — e.g. "all capabilities for subject `Post`" or "every rule that
 * grants `delete`" — without JSONB path operators. Only `conditions` remains a
 * JSONB column because its structure is inherently dynamic (arbitrary
 * MongoDB-style operators evaluated at runtime by `@ucast/mongo2js`).
 *
 * ### Relationships
 *
 * `Capability` is referenced by junction tables that assign it to roles or
 * directly to users:
 *
 * | Junction table                 | FK → `capabilities` | FK →       | Purpose                        |
 * |--------------------------------|---------------------|------------|--------------------------------|
 * | `role_capabilities`            | `capability_id`     | `role_id`  | Capabilities granted to a role |
 * | `user_additional_capabilities` | `capability_id`     | `user_id`  | Per-user extra grants          |
 * | `user_denied_capabilities`     | `capability_id`     | `user_id`  | Per-user explicit denials      |
 *
 * Roles and users live in their own tables (`roles`, `users`) and connect
 * to each other via `user_roles`.
 *
 * @example Row representation
 * ```ts
 * // A database row hydrated into a Capability:
 * const cap: Capability = {
 *   subject: 'Post',
 *   action: 'update',
 *   conditions: { authorId: '${user.id}' },
 *   fields: ['title', 'body'],
 * };
 * ```
 */
export interface Capability {
  /** The subject (entity type). Use `'all'` for any subject. */
  subject: string;
  /** The action (verb). Use `'manage'` for any action. */
  action: string;
  /**
   * UCAST / MongoDB-style conditions filter (stored as JSONB).
   *
   * Evaluated in-memory by `@ucast/mongo2js` — no MongoDB required.
   * Supports operators like `$eq`, `$ne`, `$in`, `$gt`, `$elemMatch`, etc.
   * Template placeholders (`${user.id}`, `${user.tenantId}`) are interpolated
   * at runtime from the {@link CaslUserContext}.
   *
   * `undefined` means unrestricted access (no row-level filtering).
   */
  conditions?: Record<string, unknown>;
  /** If true, this is an inverted rule (forbids instead of allows). */
  inverted?: boolean;
  /** Human-readable reason for the forbiddance (only relevant when inverted). */
  reason?: string;
  /** Optional field restrictions. */
  fields?: string[];
}

/**
 * A named set of capabilities associated with a role.
 *
 * In the database this maps to a row in the `roles` table with a many-to-many
 * relationship to the `capabilities` table via `role_capabilities`.
 *
 * At runtime, a role's capabilities can be expressed as full {@link Capability}
 * objects or compact {@link CapabilityString}s — the latter is useful when
 * collapsing role grants into a smaller payload for JWTs or session cookies.
 *
 * @example Typical resolved shape
 * ```ts
 * const editorRole: RoleDefinition = {
 *   name: 'editor',
 *   capabilities: [
 *     { subject: 'Post', action: 'read' },
 *     { subject: 'Post', action: 'update', conditions: { authorId: '${user.id}' } },
 *   ],
 * };
 *
 * // Same role collapsed for JWT transport:
 * const compact: RoleDefinition = {
 *   name: 'editor',
 *   capabilities: ['Post|read|*', 'Post|update|{"authorId":"${user.id}"}'],
 * };
 * ```
 */
export interface RoleDefinition {
  /** Unique role name (e.g. 'admin', 'author', 'viewer'). */
  name: string;
  /** Capabilities granted to this role. Can be {@link Capability} objects or {@link CapabilityString}s. */
  capabilities: Array<Capability | CapabilityString>;
}

/**
 * The resolved set of capabilities for a specific user context.
 *
 * This is a **runtime aggregate** — not a single database table. It is assembled
 * by joining:
 *
 * 1. `user_roles` → `role_capabilities` → `capabilities` (role-based grants)
 * 2. `user_additional_capabilities` → `capabilities` (per-user extra grants)
 * 3. `user_denied_capabilities` → `capabilities` (per-user explicit denials)
 *
 * Storing capabilities in proper junction tables (rather than JSONB arrays on
 * the user row) lets you:
 * - query all users that hold a specific capability
 * - add / remove individual capabilities without rewriting an entire array
 * - enforce referential integrity via foreign keys
 *
 * @example Typical resolved shape
 * ```ts
 * const caps: UserCapabilities = {
 *   roles: ['author', 'reviewer'],
 *   additionalCapabilities: [
 *     { subject: 'Analytics', action: 'read' },
 *   ],
 *   deniedCapabilities: [
 *     { subject: 'User', action: 'delete', inverted: true, reason: 'Only admins' },
 *   ],
 * };
 * ```
 */
export interface UserCapabilities {
  /** Role names assigned to the user. */
  roles: string[];
  /** Additional per-user capabilities beyond role definitions. */
  additionalCapabilities?: Array<Capability | CapabilityString>;
  /** Per-user inverted capabilities (explicit denials). */
  deniedCapabilities?: Array<Capability | CapabilityString>;
}

/**
 * The user context object that the pipeline uses to resolve capabilities.
 * Your application must place this in `context.items` under the `CASL_USER_CONTEXT` key
 * (or provide an {@link IUserContextResolver}).
 *
 * Maps to a row in the `users` table. Any additional columns (e.g. `tenant_id`,
 * `department`) are available for `${user.<prop>}` interpolation in capability
 * conditions.
 *
 * @example Resolved from the database
 * ```ts
 * // Row fetched from users table:
 * const user: CaslUserContext = {
 *   id: 'abc-123',
 *   tenantId: 'tenant-1',
 *   department: 'engineering',
 * };
 * // ${user.tenantId} in conditions resolves to 'tenant-1'
 * ```
 */
export interface CaslUserContext {
  /** Unique user identifier (used for condition interpolation). */
  id: string | number;
  /** Additional user properties for condition interpolation (e.g. `{ tenantId: 5 }`). */
  [key: string]: unknown;
}

/**
 * Default CASL ability type used throughout the package.
 * Uses string actions and string subjects for maximum flexibility.
 */
export type AppAbility = MongoAbility<[string, string]>;

/**
 * Raw CASL rule derived from the application ability type.
 */
export type AppRawRule = RawRuleOf<AppAbility>;

/**
 * A single permission requirement that the CASL behavior will check.
 *
 * @example Basic action + subject
 * ```ts
 * const req: AbilityRequirement = { action: 'read', subject: 'Post' };
 * ```
 *
 * @example Wildcard subject — user must be able to manage everything
 * ```ts
 * const req: AbilityRequirement = { action: 'manage', subject: 'all' };
 * ```
 *
 * @example Field-level — user must be able to update the 'status' field on Order
 * ```ts
 * const req: AbilityRequirement = { action: 'update', subject: 'Order', field: 'status' };
 * ```
 *
 * @example Multi-resource command — user must read Project AND manage its Tasks
 * ```ts
 * const reqs: AbilityRequirement[] = [
 *   { action: 'read', subject: 'Project' },
 *   { action: 'manage', subject: 'Task' },
 * ];
 * ```
 *
 * @example Sensitive field check — user must be able to read User.salary
 * ```ts
 * const req: AbilityRequirement = { action: 'read', subject: 'User', field: 'salary' };
 * ```
 */
export interface AbilityRequirement {
  /** The action to check (e.g. 'create', 'read', 'update', 'delete', 'manage'). */
  action: string;
  /**
   * The subject to check against.
   * - A string subject type (e.g. `'Post'`, `'User'`).
   * - `'all'` for any subject.
   */
  subject: string;
  /**
   * Optional field name(s) to check.
   * If provided, the check verifies access to specific fields.
   */
  field?: string;
}
