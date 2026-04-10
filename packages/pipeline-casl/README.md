# @nestjs-pipeline/casl

CASL authorization behavior for `@nestjs-pipeline/core` — ABAC (Attribute-Based Access Control) with role-based capability trees.

## Features

- **ABAC + Roles**: Define roles with predefined capability sets, plus per-user overrides
- **Capability tree strings**: Compact `subject|action|conditions[|fields]` format for JWT/cookie transport
- **Condition interpolation**: Template placeholders (`${id}`, `{{ tenantId }}`) resolved against user context
- **Pluggable providers**: Bring your own role provider (DB, YAML, static) and user capability provider
- **Pipeline integration**: Works as a `@UsePipeline` behavior on commands, queries, and events
- **Inline `rules`**: Declare permission requirements directly on the handler via `CaslBehaviorOptions.rules`

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
@QueryHandler(ListPostsQuery)
@UsePipeline([CaslBehavior, { skipCheck: true }])
class ListPostsHandler implements IQueryHandler<ListPostsQuery> {
  async execute(query: ListPostsQuery, context: IPipelineContext) {
    const ability = context.items.get(CASL_ABILITY_KEY) as AppAbility;
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

## Capability String Format

```
[!]subject|action|conditions[|fields]
```

| Part       | Description                            | Default/Wildcard       |
|------------|----------------------------------------|------------------------|
| `subject`  | Entity type (e.g., `Post`, `User`)     | `all` → any subject    |
| `action`   | Verb (e.g., `read`, `create`)          | `manage` → any action  |
| `conditions` | MongoDB-style JSON conditions        | `*` → none             |
| `fields`   | Comma-separated field names            | omitted or `*` → all   |
| `!` prefix | Inverted (deny) rule                   | —                      |

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
      deniedCapabilities: userRecord.deniedCaps,    // e.g., ['!Post|delete|*']
    };
  }
}
```

### PostgreSQL-backed providers

<details>
<summary>Suggested relational schema</summary>

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
      // Required at runtime — without this, handlers with rules will throw.
      // Implement IUserCapabilityProvider to map the current user to their role names.
      userCapabilityProvider: YamlUserCapabilityProvider,
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

After the CASL behavior runs, the resolved ability is available in `context.items`:

```ts
import { CASL_ABILITY_KEY, AppAbility } from '@nestjs-pipeline/casl';

const ability = context.items.get(CASL_ABILITY_KEY) as AppAbility;
if (ability.can('publish', 'Post')) {
  // ...
}
```

## License

See [LICENSE](../../LICENSE) and [COMMERCIAL_LICENSE.txt](../../COMMERCIAL_LICENSE.txt).
