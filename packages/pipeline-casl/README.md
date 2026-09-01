# @nestjs-pipeline/casl

CASL authorization behavior for `@nestjs-pipeline/core` — ABAC (Attribute-Based Access Control) with role-based capability trees.

## Features

- **ABAC + Roles**: Define roles with predefined capability sets, plus per-user overrides
- **Capability tree strings**: Compact `subject|action|conditions[|fields[|reason]]` format for JWT/cookie transport
- **Condition interpolation**: Template placeholders (`${id}`, `{{ tenantId }}`, `{{ tenantSchema }}`) resolved against user context
- **Pluggable providers**: Bring your own role provider (DB, YAML, static) and user capability provider
- **Pipeline integration**: Works as a `@UsePipeline` behavior on commands, queries, and events
- **Inline `rules`**: Declare permission requirements directly on the handler via `CaslBehaviorOptions.rules`
- **Configurable subject context paths**: Resolve nested session/user payloads explicitly via `subjectContextPaths`
- **Global field-level checks**: Enforce field permissions from request payloads with `defaultFieldsFromRequest`

CASL is tenant-model agnostic: conditions can target any tenant scope field
(`tenantId`, `tenantSchema`, organization id, etc.) available in request/user context.

## Package Anatomy

Everything is re-exported from the package root (`@nestjs-pipeline/casl`). The
moving parts fall into seven groups.

### Behavior

| Export | Kind | Purpose |
|--------|------|---------|
| `CaslBehavior` | class | The pipeline behavior. Resolves the user, builds their ability, stores it on the pipeline context, and enforces the handler's `rules`. |
| `CaslBehaviorOptions` | interface | Per-handler options passed as the second tuple element of `@UsePipeline([CaslBehavior, { ... }])`. |

`CaslBehaviorOptions` fields:

| Option | Type | Description |
|--------|------|-------------|
| `rules` | `AbilityRequirement[]` | Requirements to enforce. **All** must pass (logical AND). |
| `subjectFromRequest` | `string \| string[]` | Promote the named subject(s) to an *instance-level* check, so CASL evaluates conditions against the request payload. |
| `subjectContextPaths` | `string[]` | Request dot-paths whose payload is merged in for instance checks. Overrides the module default. |
| `fieldsFromRequest` | `string[] \| Record<string, string[]>` | Which request fields to validate for field-level permission. Does **not** grant access — only narrows what is checked. |
| `skipCheck` | `boolean` | Build and store the ability but skip enforcement (useful for public endpoints that shape their response from the ability). |
| `prebuiltAbility` | `AppAbility` | Use a supplied ability instead of resolving one from providers — handy for tests or precomputed/cached abilities. |

### Module

| Export | Kind | Purpose |
|--------|------|---------|
| `CaslModule` | class | `CaslModule.forRoot(options)` wires the providers and tokens. |
| `CaslModuleOptions` | interface | Registration options. |

`CaslModuleOptions` fields:

| Option | Required | Description |
|--------|----------|-------------|
| `roleProvider` | yes | `IRoleProvider` as a class, or `{ useClass }` / `{ useExisting }` / `{ useFactory, inject }`. |
| `subjectContextPaths` | yes | Default request dot-paths used to merge session/user payload for instance-level checks. |
| `userContextResolver` | no | `IUserContextResolver` used to resolve the user from the items bag (instead of the `CASL_USER_CONTEXT_KEY` lookup). |
| `userCapabilityProvider` | no* | `IUserCapabilityProvider`. *Used when the resolved user does not already carry a valid `capabilities` bag and no `prebuiltAbility` is supplied; it maps the user to roles/overrides. |
| `defaultFieldsFromRequest` | no | Default `fieldsFromRequest` configuration applied per subject. |

When building an ability for a resolved user, `CaslBehavior` first checks for a
valid `user.capabilities` bag (for example capabilities embedded in a verified
JWT/session). Only when that is absent does it call `userCapabilityProvider`.
A per-handler `prebuiltAbility` bypasses provider-based ability construction.

### Providers & interfaces

| Export | Kind | Purpose |
|--------|------|---------|
| `IRoleProvider` | interface | Supplies `RoleDefinition[]` from any source (DB, YAML, static). Registered under `CASL_ROLE_PROVIDER`. |
| `IUserContextResolver` | interface | Resolves the `CaslUserContext` from the pipeline context. Registered under `CASL_USER_CONTEXT_RESOLVER`. |
| `IUserCapabilityProvider` | interface | Maps a user to their roles plus per-user additional/denied capabilities. Registered under `CASL_USER_CAPABILITY_PROVIDER`. |
| `StaticRoleProvider` | class | In-memory `IRoleProvider` for roles defined in code or a config file. |

### Factory

| Export | Signature | Purpose |
|--------|-----------|---------|
| `buildAbility` | `(roles, user?, additional?, denied?)` | Merges role + additional + denied capabilities, forcibly inverts every entry in `denied`, interpolates conditions against `user`, and globally re-orders so every deny lands after every allow. |
| `buildAbilityFromRules` | `(rules: AppRawRule[])` | Builds an ability from pre-computed raw rules **as-is** (no re-ordering). Ideal for rebuilding from a JWT/cache. |

### Capability helpers

| Export | Purpose |
|--------|---------|
| `parseCapabilityString` | `CapabilityString` → `Capability`; rejects conditions unless they are a non-null, non-array JSON object. |
| `serializeCapability` | `Capability` → compact `CapabilityString` (e.g. for JWT claims). |
| `normalizeCapability` | Accept either form, runtime-validate it, and return a `Capability`. |
| `capabilityToRawRule` | `Capability` → `AppRawRule`, interpolating conditions if a user is supplied. |
| `capabilitiesToRawRules` | Array of capabilities/strings → ordered `AppRawRule[]` (allows then denies within the list). |
| `interpolateConditions` | Recursively resolve `${id}` / `${user.id}` and `{{ ... }}` placeholders, including inside arrays. Only the explicit `user.` alias is stripped. **Fails closed** — throws on an unresolved placeholder. |

### Runtime access helpers

| Export | Purpose |
|--------|---------|
| `getCaslAbility(context?)` | Read the resolved `AppAbility` from the ambient pipeline store (or an explicit context). |
| `CaslEntityAuthorizer` | Generic authorizer adapter for entity instances and field-level permissions backed by CASL. |

### Tokens & types

Injection tokens: `CASL_ROLE_PROVIDER`, `CASL_USER_CONTEXT_RESOLVER`,
`CASL_USER_CAPABILITY_PROVIDER`, `CASL_SUBJECT_CONTEXT_PATHS`,
`CASL_FIELDS_FROM_REQUEST`, `CASL_BEHAVIOR_LOGGER`. Plus two string keys for the
items bag: `CASL_USER_CONTEXT_KEY` (`'casl:user'`, the input user context) and
`CASL_ABILITY_KEY` (`'casl:ability'`, the stored output ability).

Types: `Capability`, `CapabilityString`, `RoleDefinition`, `UserCapabilities`,
`CaslUserContext`, `AbilityRequirement`, and the CASL aliases `AppAbility`
(`MongoAbility<[string, string]>`) and `AppRawRule` (`RawRuleOf<AppAbility>`).

## Installation

```bash
pnpm add @nestjs-pipeline/casl @casl/ability
```

## Quick Start

### 1. Define roles

```ts
import { StaticRoleProvider } from '@nestjs-pipeline/casl';

const roleProvider = new StaticRoleProvider([
  {
    name: 'admin',
    capabilities: ['all|manage|*'], // manage everything
  },
  {
    name: 'author',
    capabilities: [
      'Post|read|*',
      'Post|create|*',
      'Post|update|{"authorId":"${id}"}',  // own posts only
      'Post|delete|{"authorId":"${id}"}',
      'Comment|read|*',
      'Comment|create|*',
    ],
  },
  {
    name: 'viewer',
    capabilities: ['Post|read|*', 'Comment|read|*'],
  },
]);
```

<details>
<summary>Multi-tenant example with field restrictions and denials</summary>

```ts
const roleProvider = new StaticRoleProvider([
  {
    name: 'tenant-admin',
    capabilities: [
      'User|manage|{"tenantId":"${user.tenantId}"}',
      'Project|manage|{"tenantId":"${user.tenantId}"}',
      'Invoice|read|{"tenantId":"${user.tenantId}"}',
      '!Invoice|delete|*', // cannot delete invoices even within own tenant
    ],
  },
  {
    name: 'project-manager',
    capabilities: [
      'Project|read|{"tenantId":"${user.tenantId}"}',
      // Update projects they belong to, only in active/planning status
      'Project|update|{"tenantId":"${user.tenantId}","members":{"$elemMatch":{"userId":"${user.id}"}},"status":{"$in":["active","planning"]}}',
      // Manage own tasks, read all tasks in tenant
      'Task|manage|{"tenantId":"${user.tenantId}","assigneeId":"${user.id}"}',
      'Task|read|{"tenantId":"${user.tenantId}"}',
      // Delete only own draft comments
      'Comment|read|{"tenantId":"${user.tenantId}"}',
      'Comment|create|*',
      'Comment|delete|{"authorId":"${user.id}","status":"draft"}',
    ],
  },
  {
    name: 'auditor',
    capabilities: [
      // Read-only with restricted fields on User (4th segment)
      'User|read|{"tenantId":"${user.tenantId}"}|id,name,email,role',
      'Project|read|{"tenantId":"${user.tenantId}"}',
      'Invoice|read|{"tenantId":"${user.tenantId}"}',
      'AuditLog|read|{"tenantId":"${user.tenantId}"}',
      '!User|update|*',
    ],
  },
]);
```

</details>

### 2. Register the module

```ts
import { CaslModule, CaslBehavior } from '@nestjs-pipeline/casl';
import { PipelineModule } from '@nestjs-pipeline/core';

@Module({
  imports: [
    CaslModule.forRoot({
      roleProvider: { useFactory: () => roleProvider },
      subjectContextPaths: ['sessionUser'],
      defaultFieldsFromRequest: {
        User: ['username', 'department', 'email'],
      },
      userCapabilityProvider: DatabaseUserCapabilityProvider,
    }),
    PipelineModule.forRoot({
      globalBehaviors: {
        scope: 'all',
        before: [CaslBehavior],
      },
    }),
  ],
})
export class AppModule {}
```

Keep `CaslBehavior` in global `before` as shown. Authorization must run outside
cache/idempotency behaviors that may return a stored response without invoking
the rest of the chain. Redeclaring `CaslBehavior` on a handler to supply rules
overrides its options without moving it from this global position.

`subjectContextPaths` is explicit and required at module registration. CASL does
not assume a built-in request path such as `sessionUser`.

### 3. Declare rules on handlers

Permission requirements are declared inline via `CaslBehaviorOptions.rules` on
the handler's `@UsePipeline`. This keeps rules co-located with the handler.

```ts
import { CaslBehavior } from '@nestjs-pipeline/casl';

// Simple command — user must be able to create Posts
@CommandHandler(CreatePostCommand)
@UsePipeline([CaslBehavior, {
  rules: [{ action: 'create', subject: 'Post' }],
}])
class CreatePostHandler implements ICommandHandler<CreatePostCommand> {
  async execute(command: CreatePostCommand) { /* ... */ }
}

// Simple query — user must be able to read Posts
@QueryHandler(GetPostQuery)
@UsePipeline([CaslBehavior, {
  rules: [{ action: 'read', subject: 'Post' }],
}])
class GetPostHandler implements IQueryHandler<GetPostQuery> {
  async execute(query: GetPostQuery) { /* ... */ }
}
```

<details>
<summary>Complex rules examples</summary>

```ts
// Cross-resource command — user must be able to update Order.status AND create AuditLog
@CommandHandler(FulfillOrderCommand)
@UsePipeline([CaslBehavior, {
  subjectFromRequest: 'Order',
  rules: [
    { action: 'update', subject: 'Order', field: 'status' },
    { action: 'create', subject: 'AuditLog' },
  ],
}])
class FulfillOrderHandler { /* ... */ }

// Multi-tenant query — must read both Project and its Tasks
@QueryHandler(GetProjectWithTasksQuery)
@UsePipeline([CaslBehavior, {
  rules: [
    { action: 'read', subject: 'Project' },
    { action: 'read', subject: 'Task' },
  ],
}])
class GetProjectWithTasksHandler { /* ... */ }

// Admin-only purge command
@CommandHandler(PurgeDeletedUsersCommand)
@UsePipeline([CaslBehavior, {
  rules: [{ action: 'manage', subject: 'all' }],
}])
class PurgeDeletedUsersHandler { /* ... */ }

// Sensitive data — must be able to read User AND the salary field specifically
@QueryHandler(GetPayrollReportQuery)
@UsePipeline([CaslBehavior, {
  rules: [
    { action: 'read', subject: 'User' },
    { action: 'read', subject: 'User', field: 'salary' },
  ],
}])
class GetPayrollReportHandler { /* ... */ }

// Event authorization — only users who can 'publish' a Post
@UsePipeline([CaslBehavior, {
  rules: [{ action: 'publish', subject: 'Post' }],
}])
class PostPublishedHandler { /* ... */ }
```

</details>

### 4. Handler options with `@UsePipeline`

`CaslBehaviorOptions` controls _how_ permissions are checked:

```ts
import { CaslBehavior } from '@nestjs-pipeline/casl';

// ── Type-level check (default) ──────────────────────────────────────────
// "Can this user read Posts at all?" — no conditions are evaluated
// against the query payload.
@QueryHandler(GetPostQuery)
@UsePipeline([CaslBehavior, {
  rules: [{ action: 'read', subject: 'Post' }],
}])
class GetPostHandler { /* ... */ }

// ── Instance-level check with subjectFromRequest ────────────────────────
// CASL evaluates conditions against the command payload.
// If the capability is Post|update|{"authorId":"${user.id}"}, CASL checks
// that command.authorId matches the current user's id.
@CommandHandler(UpdatePostCommand)
@UsePipeline([CaslBehavior, {
  subjectFromRequest: 'Post',
  rules: [{ action: 'update', subject: 'Post' }],
}])
class UpdatePostHandler { /* ... */ }

// ── Multi-tenant with complex conditions ────────────────────────────────
// Capability: Project|update|{"tenantId":"${user.tenantId}","status":{"$in":["active","planning"]}}
// subjectFromRequest makes CASL check tenantId AND status on the command.
@CommandHandler(UpdateProjectCommand)
@UsePipeline([CaslBehavior, {
  subjectFromRequest: 'Project',
  rules: [{ action: 'update', subject: 'Project' }],
}])
class UpdateProjectHandler { /* ... */ }

// ── Nested session/user payloads ───────────────────────────────────────
// Some apps keep actor context under a nested request object instead of at the root.
// Configure the path explicitly so CASL can merge that payload for condition checks.
@CommandHandler(UpdateUserCommand)
@UsePipeline([CaslBehavior, {
  subjectFromRequest: 'User',
  subjectContextPaths: ['auth.session.user'],
  rules: [{ action: 'update', subject: 'User' }],
}])
class UpdateUserHandler { /* ... */ }

// ── Field-level update enforcement from request payload ────────────────
// fieldsFromRequest does not grant access. It only tells CASL which changed
// fields to validate against the user's ability.
@CommandHandler(UpdateUserProfileCommand)
@UsePipeline([CaslBehavior, {
  subjectFromRequest: 'User',
  fieldsFromRequest: ['username', 'department', 'email'],
  rules: [{ action: 'update', subject: 'User' }],
}])
class UpdateUserProfileHandler { /* ... */ }

// ── Cross-resource command ──────────────────────────────────────────────
// User must update Order.status AND create AuditLog.
// subjectFromRequest: 'Order' checks conditions on the Order requirement;
// the AuditLog requirement is type-level only.
@CommandHandler(FulfillOrderCommand)
@UsePipeline([CaslBehavior, {
  subjectFromRequest: 'Order',
  rules: [
    { action: 'update', subject: 'Order', field: 'status' },
    { action: 'create', subject: 'AuditLog' },
  ],
}])
class FulfillOrderHandler { /* ... */ }

// ── Public endpoint with skipCheck ──────────────────────────────────────
// No rules needed. The ability is built and stored for
// downstream use, but no access check is performed.
//
// Note: handlers receive ONLY the query/command — the pipeline context is
// not passed as an argument. It flows through an AsyncLocalStorage store, so
// use `getCaslAbility()` (or `pipelineStore.getStore()`) to read the ability.
@QueryHandler(ListPostsQuery)
@UsePipeline([CaslBehavior, { skipCheck: true }])
class ListPostsHandler implements IQueryHandler<ListPostsQuery> {
  async execute(query: ListPostsQuery) {
    const ability = getCaslAbility();
    const includeDrafts = ability?.can('read', 'DraftPost');
    // Tailor the response based on what the user can see
  }
}
```

### 5. Set user context

Place the user context in `context.items` before the CASL behavior runs (e.g., in an authentication middleware/behavior):

```ts
import { CASL_USER_CONTEXT_KEY } from '@nestjs-pipeline/casl';

// In your auth behavior or middleware:
context.items.set(CASL_USER_CONTEXT_KEY, {
  id: user.id,
  tenantId: user.tenantId,
  // ...any properties needed for condition interpolation
});
```

Or implement `IUserContextResolver` for custom extraction.

When your request keeps actor/session data under a nested object, pair this
with `subjectContextPaths` so both user resolution and subject condition checks
read from the same configured path.

## Capability String Format

```
[!]subject|action|conditions[|fields[|reason]]
```

| Part       | Description                            | Default/Wildcard       |
|------------|----------------------------------------|------------------------|
| `subject`  | Entity type (e.g., `Post`, `User`)     | `all` → any subject    |
| `action`   | Verb (e.g., `read`, `create`)          | `manage` → any action  |
| `conditions` | MongoDB-style JSON conditions        | `*` → none             |
| `fields`   | Comma-separated field names            | omitted or `*` → all   |
| `reason`   | Human-readable rule reason              | omitted                |
| `!` prefix | Inverted (deny) rule                   | —                      |

Segments that contain reserved delimiters (and unsafe field arrays) are encoded
as `~` followed by base64url JSON. `parseCapabilityString()` and
`serializeCapability()` handle this automatically and round-trip `reason` too.

### Examples

| String                                  | Meaning                          |
|-----------------------------------------|----------------------------------|
| `all\|manage\|*`                        | Full access to everything        |
| `Post\|read\|*`                         | Read any post                    |
| `Post\|manage\|*`                       | Manage all posts                 |
| `Post\|update\|{"authorId":"${id}"}`    | Update own posts only            |
| `Post\|read\|*\|title,body,status`      | Read only title, body, status    |
| `!Post\|delete\|*`                      | Cannot delete any post           |
| `Post\|update\|{"authorId":"${id}","status":{"$in":["draft","review"]}}` | Update own posts only in draft/review |
| `Document\|read\|{"tenantId":"${user.tenantId}","visibility":{"$ne":"private"}}` | Read tenant docs that are not private |
| `Order\|update\|{"assigneeId":"${id}","status":{"$nin":["completed","cancelled"]}}` | Update own orders unless completed/cancelled |

## Per-User Overrides

Implement `IUserCapabilityProvider` to add capabilities beyond a user's role:

```ts
@Injectable()
export class DbUserCapabilityProvider implements IUserCapabilityProvider {
  async getUserCapabilities(user: CaslUserContext): Promise<UserCapabilities> {
    const userRecord = await this.db.findUser(user.id);
    return {
      roles: userRecord.roles,                     // ['author']
      additionalCapabilities: userRecord.extraCaps, // e.g., ['User|invite|*']
      deniedCapabilities: userRecord.deniedCaps,    // e.g., ['Post|delete|*']; container forces denial
    };
  }
}
```

### PostgreSQL-backed providers

Persistence representation is application-specific. The example below uses
PostgreSQL-native `jsonb` and `text[]` columns, but providers may instead parse
serialized JSON/delimited text into `conditions` objects and `fields` arrays.
The sample application does that to keep one MikroORM model portable across libSQL and
PostgreSQL.

<details>
<summary>Example PostgreSQL-native relational schema</summary>

```sql
-- Central entity: every permission is a Capability row
CREATE TABLE capabilities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject    TEXT NOT NULL,
  action     TEXT NOT NULL,
  conditions JSONB,
  inverted   BOOLEAN NOT NULL DEFAULT false,
  reason     TEXT,
  fields     TEXT[]
);
CREATE INDEX idx_capabilities_subject ON capabilities (subject);
CREATE INDEX idx_capabilities_action ON capabilities (action);
CREATE UNIQUE INDEX idx_capabilities_unique ON capabilities (subject, action, conditions);

-- Roles
CREATE TABLE roles (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

-- Role ↔ Capability junction
CREATE TABLE role_capabilities (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, capability_id)
);

-- User ↔ Role junction
CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- Per-user additional capabilities
CREATE TABLE user_additional_capabilities (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, capability_id)
);

-- Per-user denied capabilities
CREATE TABLE user_denied_capabilities (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, capability_id)
);
```

See [`demo-seed.sql`](demo-seed.sql) for complete seed data with all 7 roles (admin, viewer, author, tenant-admin, project-manager, auditor, support-agent), 25+ capabilities, role assignments, and example user/override templates.

</details>

<details>
<summary>Provider implementations</summary>

```ts
@Injectable()
export class PgRoleProvider implements IRoleProvider {
  constructor(private readonly pool: Pool) {}

  async getRoles(names?: string[]): Promise<RoleDefinition[]> {
    const where = names ? 'WHERE r.name = ANY($1)' : '';
    const params = names ? [names] : [];
    const { rows } = await this.pool.query(
      `SELECT r.name,
              json_agg(json_build_object(
                'subject', c.subject, 'action', c.action,
                'conditions', c.conditions, 'inverted', c.inverted,
                'reason', c.reason, 'fields', c.fields
              )) AS capabilities
       FROM roles r
       JOIN role_capabilities rc ON rc.role_id = r.id
       JOIN capabilities c ON c.id = rc.capability_id
       ${where}
       GROUP BY r.id`,
      params,
    );
    return rows;
  }
}

@Injectable()
export class PgUserCapabilityProvider implements IUserCapabilityProvider {
  constructor(private readonly pool: Pool) {}

  async getUserCapabilities(user: CaslUserContext): Promise<UserCapabilities> {
    const rolesResult = await this.pool.query(
      'SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1',
      [user.id],
    );

    const additionalResult = await this.pool.query(
      `SELECT c.subject, c.action, c.conditions, c.inverted, c.reason, c.fields
       FROM user_additional_capabilities uac
       JOIN capabilities c ON c.id = uac.capability_id
       WHERE uac.user_id = $1`,
      [user.id],
    );

    const deniedResult = await this.pool.query(
      `SELECT c.subject, c.action, c.conditions, c.inverted, c.reason, c.fields
       FROM user_denied_capabilities udc
       JOIN capabilities c ON c.id = udc.capability_id
       WHERE udc.user_id = $1`,
      [user.id],
    );

    return {
      roles: rolesResult.rows.map((r) => r.name),
      additionalCapabilities: additionalResult.rows,
      deniedCapabilities: deniedResult.rows,
    };
  }
}
```

</details>

### YAML-backed roles

For projects that don't need a database, roles can be defined in a YAML file and loaded at startup. See [`demo-roles.yml`](demo-roles.yml) for a complete example with basic roles, multi-tenant roles, field restrictions, and deny rules.

<details>
<summary>YAML role provider implementation</summary>

```ts
import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import type { IRoleProvider, RoleDefinition, Capability } from '@nestjs-pipeline/casl';

interface YamlCapabilityObject {
  subject: string;
  action: string;
  conditions?: Record<string, unknown>;
  inverted?: boolean;
  reason?: string;
  fields?: string[];
}

interface YamlRolesFile {
  roles: Array<{
    name: string;
    capabilities: Array<string | YamlCapabilityObject>;
  }>;
}

@Injectable()
export class YamlRoleProvider implements IRoleProvider {
  private readonly roles: RoleDefinition[];

  constructor(filePath: string) {
    const raw = readFileSync(resolve(filePath), 'utf-8');
    const parsed = parse(raw) as YamlRolesFile;

    this.roles = parsed.roles.map((r) => ({
      name: r.name,
      capabilities: r.capabilities.map((cap) => {
        if (typeof cap === 'string') return cap; // CapabilityString
        // Object form → Capability
        const result: Capability = { subject: cap.subject, action: cap.action };
        if (cap.conditions) result.conditions = cap.conditions;
        if (cap.inverted) result.inverted = true;
        if (cap.reason) result.reason = cap.reason;
        if (cap.fields) result.fields = cap.fields;
        return result;
      }),
    }));
  }

  getRoles(names?: string[]): RoleDefinition[] {
    if (!names) return this.roles;
    return this.roles.filter((r) => names.includes(r.name));
  }
}
```

</details>

<details>
<summary>Module wiring with YAML provider</summary>

```ts
@Module({
  imports: [
    CaslModule.forRoot({
      roleProvider: {
        useFactory: () => new YamlRoleProvider('./config/roles.yml'),
      },
      userContextResolver: JwtUserContextResolver,
      // Used when the resolved user does not already carry a valid capabilities bag.
      // Implement IUserCapabilityProvider to map that user to their role names.
      userCapabilityProvider: YamlUserCapabilityProvider,
      subjectContextPaths: [],
    }),
    PipelineModule.forRoot({
      globalBehaviors: { scope: 'all', before: [CaslBehavior] },
    }),
  ],
})
export class AppModule {}
```

</details>

<details>
<summary>Module wiring with PostgreSQL providers</summary>

```ts
@Module({
  imports: [
    CaslModule.forRoot({
      roleProvider: {
        useFactory: (pool: Pool) => new PgRoleProvider(pool),
        inject: [Pool],
      },
      userContextResolver: JwtUserContextResolver,
      userCapabilityProvider: {
        useFactory: (pool: Pool) => new PgUserCapabilityProvider(pool),
        inject: [Pool],
      },
      subjectContextPaths: [],
    }),
    PipelineModule.forRoot({
      globalBehaviors: { scope: 'all', before: [CaslBehavior] },
    }),
  ],
})
export class AppModule {}
```

</details>

## Accessing the Ability Downstream

After the CASL behavior runs, the resolved ability is stored on the pipeline
context. Handlers are invoked with **only** the command/query argument — the
context is not passed in; it is carried through an `AsyncLocalStorage` store.
Use the `getCaslAbility()` helper to read it from anywhere inside the handler
call stack:

```ts
import { getCaslAbility } from '@nestjs-pipeline/casl';

const ability = getCaslAbility();
if (ability?.can('publish', 'Post')) {
  // ...
}
```

### Two-phase (entity-level) authorization

`CaslBehavior` runs *before* the handler, so it can only evaluate conditions
against the incoming request payload. Conditions that depend on the **persisted**
state of the target entity (e.g. "a supervisor may only update users in their own
department") must be re-checked after the entity is loaded:

```ts
async handle(command: UpdateUserCommand) {
  const user = await this.repo.find(command.id);

  // Authorize directly on the entity using CASL authorizer
  user.authorize('update', ['username']);

  // ...apply the update
}
```

Manually reading the raw store is also possible if you prefer:

```ts
import { pipelineStore } from '@nestjs-pipeline/core';
import { CASL_ABILITY_KEY, AppAbility } from '@nestjs-pipeline/casl';

const ability = pipelineStore.getStore()?.items.get(CASL_ABILITY_KEY) as
  | AppAbility
  | undefined;
```

## Recipes

Extra, self-contained examples for common needs beyond the Quick Start.

### Field-level partial updates

Allow a user to change some columns but not others. The capability lists the
permitted fields; `fieldsFromRequest` tells CASL which changed fields to verify.

```ts
// Role capability — may update users in own tenant, but only name & username:
//   User|update|{"tenantId":"${user.tenantId}"}|name,username
@CommandHandler(UpdateUserCommand)
@UsePipeline([CaslBehavior, {
  subjectFromRequest: 'User',
  fieldsFromRequest: ['name', 'username'], // department/email would be rejected
  rules: [{ action: 'update', subject: 'User' }],
}])
class UpdateUserHandler { /* ... */ }
```

### Compact capabilities in a JWT (no DB on the hot path)

Collapse capabilities into strings at login, embed them in the token, then
rebuild the ability per-request without touching the database.

```ts
import {
  serializeCapability,
  parseCapabilityString,
  capabilitiesToRawRules,
  buildAbilityFromRules,
} from '@nestjs-pipeline/casl';

// ── At login: persist a compact capability list into the JWT ──
const claims = {
  sub: user.id,
  tenantId: user.tenantId,
  caps: resolvedCapabilities.map(serializeCapability),
  // e.g. ['Post|read|*', 'Post|update|{"authorId":"${id}"}', '!Post|delete|*']
};

// ── Per request (e.g. inside an IUserContextResolver or auth behavior) ──
const rules = capabilitiesToRawRules(
  jwt.caps.map(parseCapabilityString),
  { id: jwt.sub, tenantId: jwt.tenantId }, // interpolates ${id}, ${user.tenantId}
);
const ability = buildAbilityFromRules(rules);
```

### Testing a handler with `prebuiltAbility`

Bypass providers entirely and inject a known ability — ideal for unit tests.

```ts
import { buildAbilityFromRules, capabilitiesToRawRules, CaslBehavior } from '@nestjs-pipeline/casl';

const ability = buildAbilityFromRules(
  capabilitiesToRawRules(['Post|read|*', '!Post|delete|*']),
);

@QueryHandler(GetPostQuery)
@UsePipeline([CaslBehavior, {
  prebuiltAbility: ability,
  rules: [{ action: 'read', subject: 'Post' }],
}])
class GetPostHandler { /* ... */ }
```

### Building an ability standalone with `buildAbility`

Use the factory directly when you need an ability outside the pipeline (scripts,
background jobs, custom guards). It merges roles, per-user additions and denials,
and guarantees denies win across sources.

```ts
import { buildAbility } from '@nestjs-pipeline/casl';

const roles = await roleProvider.getRoles(['author']);
const ability = buildAbility(
  roles,
  { id: user.id, tenantId: user.tenantId }, // condition interpolation context
  ['User|invite|*'],                        // per-user additional capabilities
  ['!Post|delete|*'],                       // per-user denied capabilities
);

ability.can('invite', 'User');   // true
ability.can('delete', 'Post');   // false (deny applied after any allow)
```

### Two-phase entity authorization

`CaslBehavior` can only see the request payload. For rules that depend on the
**persisted** entity, re-check after loading it via `entity.authorize(action, fields?)` (see
[Accessing the Ability Downstream](#accessing-the-ability-downstream) above).

## License

See [LICENSE](../../LICENSE) and [COMMERCIAL_LICENSE.txt](../../COMMERCIAL_LICENSE.txt).
