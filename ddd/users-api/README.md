# @nestjs-pipeline/ddd-users-api

Disposable reference application demonstrating the `@nestjs-pipeline/*` packages with NestJS CQRS, MikroORM, CASL, Zod, caching, tracing, rate limiting, audit, idempotency, feature flags, resilience, correlation IDs, and dead-letter handling.

This directory is a **demo**, not a migration-compatibility target. Its database history may be reset whenever the sample schema changes. Do not use its migration files as an upgrade path for a real application.

## Fresh setup

Start from an empty database/schema:

```bash
cd ddd/users-api
pnpm install
pnpm build
cp .env.example .env
pnpm db:migrate
pnpm dev
```

`db:migrate` applies the single current initial migration. That migration creates the complete schema and inserts the demo seed in one pass.

If the demo schema changes, delete the local demo database (or drop/recreate the PostgreSQL tenant schema) and run `pnpm db:migrate` again. There is intentionally no compatibility migration chain for older versions of this sample.

## Persistence modes

### libSQL / SQLite

Default local configuration:

```env
DB_ENGINE=libsql
DATABASE_URL=file:src/persistence/local.db
DB_DEFAULT_SCHEMA=tenant
```

A single tenant uses `DATABASE_URL` unchanged. For multiple local tenants, set `SQLITE_TENANTS`; derived files get a tenant suffix. Multiple remote libSQL tenants require `SQLITE_DATABASE_TEMPLATE` containing `{tenant}`.

### PostgreSQL

Set `DB_ENGINE=postgres` and configure the PostgreSQL environment variables. Each tenant uses a separate schema. `TENANT_SCHEMAS` controls which schemas are migrated by the CLI.

Both engines use the `x-tenant-schema` request header to select the active tenant.

## Current schema

The fresh initial migration creates:

- `users`
- `auth`
- `roles`
- `capabilities`
- `role_capabilities`
- `user_roles`
- `user_additional_capabilities`
- `user_denied_capabilities`
- `cache`

`capabilities.inverted` is created as a boolean from the beginning. There is no smallint-to-boolean compatibility conversion.

The MikroORM entity metadata and migration schema are expected to describe the same current database contract. In particular, user email is unique in both paths.

## Seed data

The initial migration inserts **8 users, 5 roles, and 14 capabilities**. Seed names/emails include the tenant token so separate tenant databases/schemas stay easy to inspect.

| User | Roles | Purpose |
|---|---|---|
| Alice | `admin` | Unrestricted `all/manage` example |
| Bob | `user-manager` | Department-scoped management with role-level denials |
| Carol | `self` | Self-read and username-only self-update |
| Dave | `viewer` | Plain read-only viewer; **no create override** |
| Eve | `viewer` + `self` | Multi-role ability merge |
| Frank | `support-agent` | Department-scoped support permissions |
| Grace | `user-manager` | Demonstrates a **per-user denial** overriding role permissions |
| Vince | `viewer` | Demonstrates a **per-user additional grant** (`User/create`) |

CASL condition placeholders in the seed use only the supported flat user context forms:

```text
${user.id}
${user.department}
```

The seed intentionally demonstrates both override directions:

- `user_additional_capabilities`: Vince receives `User/create` in addition to `viewer`.
- `user_denied_capabilities`: Grace receives an explicit `User/read` denial; the CASL package forces capabilities from the denied collection to inverted rules.

## Running requests

The sample supports Express by default and Fastify with `ADAPTER=fastify`.

Every routed request needs `x-tenant-schema`. Protected routes additionally need a bearer JWT, API credentials, or (Fastify only) the secure-session cookie.

Example shape:

```bash
curl http://localhost:3000/users \
  -H 'x-tenant-schema: tenant' \
  -H 'Authorization: Bearer <token>'
```

`POST /auth/login` returns a bearer token. With Fastify + `SESSION_SECRET`, it also populates `@fastify/secure-session`. Express intentionally uses bearer/API credentials only.

## Authentication & Context Scoping Architecture

Authentication and request-scoped context management follow a strict separation of concerns between NestJS Guards and Interceptors:

```text
Incoming HTTP Request
         │
         ▼
TenantSchemaMiddleware
         │ (Validates x-tenant-schema header, enters TenantSchemaContext)
         ▼
AuthSessionGuard (APP_GUARD)
  ├─ 1. Check Fastify session cookie (req.session?.user)
  ├─ 2. Parse & verify Bearer JWT (JwtAuthenticator)
  └─ 3. Verify API-client credentials (ApiClientAuthenticator)
  │
  ▼ Sets req.sessionUser = principal (or throws 401 Unauthorized immediately)
SessionUserContextInterceptor (APP_INTERCEPTOR)
  │
  ▼ sessionUserStore.run(req.sessionUser, () => next.handle())
Downstream Pipeline (Controllers → CQRS Bus → CASL → Audit → DB)
```

### Architecture Components

1. **`AuthSessionGuard` (`APP_GUARD`)**: Decides **who you are**. It executes early in the NestJS request lifecycle (before interceptors, pipes, or route handlers) and delegates credential resolution to:
   - **`JwtAuthenticator`**: Parses `Authorization: Bearer <token>` (case-insensitively, accepting `Bearer` or `bearer`). Supports both symmetric (`JWT_SECRET`) and asymmetric (`JWT_PUBLIC_KEY`) keys. Asymmetric SPKI keys are memoized upon first parse to eliminate repetitive ASN.1 DER parsing. Validates tenant alignment and maps CASL capabilities.
   - **`ApiClientAuthenticator`**: Authenticates machine-to-machine callers using `x-api-id` and `x-api-key` headers against configured `API_CLIENTS`. Uses constant-time fixed-length SHA-256 digest comparison (`timingSafeEqual`) to prevent timing side-channel leaks. Operates completely statelessly.
   - **`RequestPrincipalResolver`**: Lean orchestrator coordinating priority resolution (Cookie $\rightarrow$ JWT $\rightarrow$ API Key $\rightarrow$ Anonymous).
2. **`SessionUserContextInterceptor` (`APP_INTERCEPTOR`)**: Decides **the execution scope**. A single-responsibility interceptor that reads `req.sessionUser` (populated by the guard) and invokes `sessionUserStore.run(req.sessionUser, () => next.handle())`. In NestJS 11.2.1, `InterceptorsConsumer` binds stream continuations using `defer(AsyncResource.bind(...))`, guaranteeing that the `AsyncLocalStorage` context established by `run()` persists across all downstream asynchronous operations, CQRS handlers, and pipeline behaviors without cross-request context bleeding.
3. **`UserLoginService`**: Dedicated application service responsible solely for user login credential verification (`POST /auth/login`) and signing new tenant-bound access tokens.

### Modular Composition Root & Clean Infrastructure Modules

To maintain clear architectural boundaries and keep the root composition module maintainable, `AppModule` is decomposed into cohesive infrastructure modules:

- **`ObservabilityModule` (`@common/observability/observability.module.ts`)**:
  - Bundles HTTP correlation middleware (`HttpCorrelationMiddleware`), OpenTelemetry tracing, and metric collection.
  - Configures global pipeline behaviors for tracing (`TraceBehavior`) and latency/throughput metrics (`MetricsBehavior`).
- **`ReliabilityModule` (`@common/reliability/reliability.module.ts`)**:
  - Manages failure isolation and transport resilience.
  - Provides BullMQ-backed dead-letter capture (`DeadLetterBehavior`) scoped to commands and events (excluding read queries and validation errors) with automatic fallback to structured log auditing when Redis/BullMQ is unavailable.
  - Integrates in-memory and distributed rate-limiting infrastructure (`RateLimitBehavior`).
  - Swappable caching providers (`MikroOrmCache` vs `MemoryCache`).
- **`AppModule` (`src/app.module.ts`)**:
  - Lean composition root (under 90 lines) importing domain feature modules (`UsersModule`, `RolesModule`, `AuthsModule`), persistence (`MikroOrmModule`), and infrastructure modules (`ObservabilityModule`, `ReliabilityModule`).
  - Avoids leaking configuration noise or implementation details into business domain layers.

### CQRS Commands & Queries with Zod and Base Classes

All commands and queries in `users-api` are strongly-typed, self-validating, and inherit from the standard base classes using `@nestjs-pipeline/zod`:

- **Commands (100% inherit from `BaseCommand`)**:
  ```typescript
  export class CreateUserCommand extends createCommand(CreateUserSchema, BaseCommand) {}
  ```
  - Automatically tagged with `requestKind: 'command'`.
  - Inherits `sessionUser` resolution (ambient ALS store fallback) without polluting JSON payload serialization or idempotency keys (`sessionUser` is non-enumerable).
- **Queries (100% inherit from `BaseQuery`)**:
  ```typescript
  export class GetUserQuery extends createQuery(GetUserSchema, BaseQuery) {}
  ```
  - Automatically tagged with `requestKind: 'query'`.
  - Implements `IQueryOptions` (`hydrate`, `sessionUser`), keeping cache keys deterministic.
- **NestJS 12 Standard Schema**:
  - Generated classes expose `['~standard']`, allowing them to be passed directly to NestJS 12 `@Body({ schema: CommandClass })` validation pipes.
  - Static `parse()` and `safeParse()` methods are available directly on each command and query.

### MikroORM Entity Schemas & Clean Property Accessors (`accessor: true`)

Persistence schemas map domain aggregate state to relational tables without compromising encapsulation or relying on TypeScript casting workarounds:

- **Elimination of `@ts-expect-error` / `@ts-ignore`**: Entities store core attributes in private fields (`_id`, `_createdAt`, `_updatedAt`, `_username`, `_department`). Official MikroORM `accessor: true` properties instruct the ORM to read and write values exclusively through public TypeScript getters and setters:
  ```typescript
  export const UserSchema = new EntitySchema<User>({
    class: User,
    tableName: 'users',
    properties: {
      id: { type: 'string', primary: true, fieldName: 'id', accessor: true },
      createdAt: { type: UnixTimestampType, fieldName: 'created_at', accessor: true },
      updatedAt: { type: UnixTimestampType, fieldName: 'updated_at', accessor: true },
      username: { type: 'string', fieldName: 'username', accessor: true },
      department: { type: 'string', fieldName: 'department', nullable: true, accessor: true },
      email: { type: 'string', unique: true },
    },
  });
  ```
- **Encapsulated Invariant Guarding**: When MikroORM rehydrates or modifies properties, setters invoke the aggregate's domain validation routines, ensuring invalid state can never enter memory from the database.

---

### Decoupled Caching Architecture & Key Templates

Caching metadata is completely removed from domain entities (`CacheableEntity` and `ICacheKey` are obsolete). Domain entities declare only a canonical logical identity (e.g. `User.aggregateName = 'user'`), keeping domain aggregates pure DDD while caching remains strictly an infrastructure/CQRS pipeline concern:

- **Collision-Safe & Canonical Key Derivation (`filterCacheKey`)**:
  Generates deterministic, tenant-isolated cache keys by combining active tenant schema, aggregate name, and canonically sorted filter conditions:
  - **Deterministic Object Serialization**: Nested composite identities/objects are recursively key-sorted and JSON-serialized (preventing `[object Object]` bugs).
  - **Delimiter Escaping**: Primitive values containing `:` or `\` are escaped to prevent delimiter injection and key collision attacks (`{ a: 'hello:b:world' }` vs `{ a: 'hello', b: 'world' }`).
  - **Production Multi-Tenant Protection**: Refuses silent default schema fallback when running in `NODE_ENV === 'production'`; throws fail-safe if tenant context is missing.
  ```typescript
  // Single identifier lookup using entity class
  filterCacheKey(User, { id: '123' }, ctx)
  // → "tenant_a:user:id:123"

  // Composite conditions with delimiter escaping
  filterCacheKey(User.aggregateName, { email: 'alice@example.com', department: 'sales' }, 'tenant_b')
  // → "tenant_b:user:department:sales:email:alice@example.com"

  // Nested composite identities
  filterCacheKey('deployment', { compose: { service: 'postgres', file: 'docker-compose.yml' } })
  // → 'tenant:deployment:compose:{"file":"docker-compose.yml","service":"postgres"}'
  ```
- **Fail-Fast CQRS Handler Templates (`cacheKeyTemplate`)**:
  Allows query and command handlers to declaratively define cache patterns parameterized from request DTO fields:
  - Required placeholders `{prop}`: Throws an explicit error if missing or nullish (prevents silent collisions on truncated keys like `tenant:user:`).
  - Optional placeholders `{prop?}`: Resolves to an empty string if omitted.
  ```typescript
  const getKey = cacheKeyTemplate('user:{userId}');
  getKey(new GetUserQuery({ userId: 'usr_123' }))
  // → "tenant:user:usr_123"

  // Missing required placeholder throws:
  getKey({}) // Error: Cannot resolve cache key template: missing required placeholder "userId"
  ```
- **Write-Through & Automatic Eviction (`@Cache`, `@FromCache`)**:
  - `@Cache`: Attached to write repository `save()` methods. Requires explicit key derivations or options (`setKey`, `deleteKeys`, `invalidateKeys`) eliminating unsafe defaults. On create/update, results are stored in the cache. On deletion (`save()` returns `null`), all matching primary and secondary keys are evicted. Operations are fail-safe and best-effort.
  - `@FromCache`: Attached to query repository `find()` methods. Serves hits from cache and automatically stores non-nullish database results. Supports optional entity rehydration.

---

### Domain Models & Invariant Enforcement

The `User` and `Role` aggregate entities inherit identity and lifecycle behavior from `RootEntity` (`@nestjs-pipeline/ddd-core`):

- **Encapsulated Invariant Enforcement**: State modifications occur exclusively through factory and domain mutation methods (`User.create()`, `user.update()`). Invariants for `username` (minimum 3 characters, trimmed) and `department` (trimmed, minimum 3 characters when provided) are checked synchronously upon instantiation and update.
- **Framework-Agnostic Domain Exceptions**: Entities throw typed domain exceptions extending `DomainException` (`@nestjs-pipeline/ddd-core`), completely decoupled from HTTP status codes and `@nestjs/common`.

---

### CQRS Runtime Error Taxonomy & HTTP Status Code Mapping

The application enforces a consistent error taxonomy across all 8 commands and 7 queries:

| HTTP Status | Error Type | Exception Class / Source | Trigger Scenario |
|---|---|---|---|
| **400 Bad Request** | Validation Error | `ZodValidationError` | Inbound payload fails Zod schema validation (e.g. invalid email format) |
| **400 Bad Request** | Domain Error | `EmptyUserUpdateException` | Update payload contains no fields to modify (`username` and `department` absent) |
| **401 Unauthorized** | Authentication Failure | `UnauthorizedException` | Missing token, expired Bearer JWT, invalid API key, or missing server JWT key |
| **403 Forbidden** | Authorization Failure | `UnauthorizedActionException` | Caller lacks CASL permissions to perform action on subject or specific fields |
| **404 Not Found** | Resource Missing | `UserNotFoundException`, `RoleNotFoundException` | Target aggregate does not exist in the active tenant database |
| **409 Conflict** | Uniqueness Collision | `UniqueEmailException`, `UniqueRoleNameException` | Email or role name already exists in the active tenant schema |
| **422 Unprocessable Entity** | Invariant Violation | `InvalidUsernameException`, `InvalidDepartmentException` | Username or department string fails domain aggregate invariants (< 3 characters) |

#### Global API Mapping (`DomainExceptionFilter`)

The `DomainExceptionFilter` intercepts all domain exceptions at the presentation boundary and serializes them into structured JSON error payloads:

```json
{
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "message": "Username must be at least 3 characters, received: \"ab\".",
  "minLength": 3,
  "actualValue": "ab"
}
```

---

### Injectable CASL Authorization (`CaslAuthorizer`)

The service-locator anti-pattern (`RootEntity.authorize()`) has been replaced by the standalone, injectable `CaslAuthorizer` service:

```typescript
@CommandHandler(CreateUserCommand)
export class CreateUserHandler extends CommandBaseHandler<CreateUserCommand, User> {
  constructor(
    private readonly commandRepository: ICommandRepository<User, UserSnapshot>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: CreateUserCommand): Promise<User> {
    const user = User.create(command.username, command.email, command.department);

    // Enforce authorization against the active principal's ability
    this.authorizer.authorize('create', user, ['username', 'email', 'department']);

    await this.commandRepository.save(user);
    return user;
  }
}
```

---

### Practical Examples

#### 1. User Login & Token Issuance

Users authenticate via `POST /auth/login` using their email and temporary login code:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "x-tenant-schema: tenant" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice+tenant@seed.local",
    "code": "123456"
  }'
```

Response:
```json
{
  "userId": "019488e0-0000-7000-8000-000000000001",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ...",
  "userCapabilities": {
    "roles": ["admin"]
  }
}
```

#### 2. Calling Endpoints with a Bearer JWT

Present the issued token in the standard `Authorization` header:

```bash
curl http://localhost:3000/users \
  -H "x-tenant-schema: tenant" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ..."
```

#### 3. Machine-to-Machine Integration via API Credentials

Automated scripts and background services authenticate using static API credentials:

```bash
curl http://localhost:3000/users \
  -H "x-tenant-schema: tenant" \
  -H "x-api-id: reporting-service" \
  -H "x-api-key: secret-api-key-999"
```

Configure authorized clients in `.env` as a JSON array:

```env
API_CLIENTS='[{"id":"reporting-service","key":"secret-api-key-999","tenants":["tenant"],"capabilities":{"roles":["reporter"]}}]'
```

#### 4. Defining & Executing a CQRS Command with Pipeline Behaviors

Commands use `createCommand()` to guarantee Zod schema enforcement, idempotency, and audit logging:

```typescript
// 1. Command Definition (createCommand)
export const CreateUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  department: z.string().min(3).max(50).optional(),
});

export class CreateUserCommand extends createCommand(CreateUserSchema, BaseCommand) {}

// 2. Command Handler with Pipeline Behaviors
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [CaslBehavior, { rules: [{ action: APP_ACTIONS.CREATE, subject: APP_SUBJECTS.USER }] }],
  [FeatureFlagBehavior, { flag: 'user-registration' }],
  [RateLimitBehavior, { keyFactory: (ctx) => `${ctx.tenantId}:${ctx.request.email}` }],
  [IdempotencyBehavior, { keyFactory: createUserIdempotencyKey }],
)
export class CreateUserHandler extends CommandBaseHandler<CreateUserCommand, User> {
  constructor(
    @Inject(COMMAND_REPOSITORY.createUser)
    private readonly commandRepository: ICommandRepository<User, UserSnapshot>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: CreateUserCommand): Promise<User> {
    const user = User.create(command.username, command.email, command.department);

    // Entity-level and field-level permission check
    this.authorizer.authorize('create', user, ['username', 'email', 'department']);

    await this.commandRepository.save(user);
    return user;
  }
}
```

#### 5. Executing a CQRS Query with Read-Through Caching

Queries use `createQuery()` with read-through caching in the repository:

```typescript
// 1. Query Definition (createQuery)
export const GetUserSchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
});

export class GetUserQuery extends createQuery(GetUserSchema, BaseQuery) {}

// 2. Query Repository with @FromCache
@Injectable()
export class GetUserQueryRepository extends QueryRepository<GetUserQuery, User | null> {
  @FromCache<GetUserQuery, User>(
    (q) => filterCacheKey(User.aggregateName, q.userId ? { id: q.userId } : { email: q.email }),
    (cached) => User.fromJSON(cached as UserSnapshot),
  )
  async find(query: GetUserQuery): Promise<User | null> {
    return this.store.em.findOne(User, query.userId ? { id: query.userId } : { email: query.email });
  }
}

// 3. Query Handler with CASL
@QueryHandler(GetUserQuery)
@UsePipeline([CaslBehavior, { rules: [{ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER }] }])
export class GetUserHandler implements IQueryHandler<GetUserQuery, UserSnapshot | null> {
  constructor(
    @Inject(QUERY_REPOSITORY.getUser) private readonly queryRepository: IQueryRepository<GetUserQuery, User | null>,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetUserQuery): Promise<UserSnapshot | null> {
    const user = User.from(await this.queryRepository.find(query));
    return user ? this.authorizer.authorize<UserSnapshot>('read', user) : null;
  }
}
```

#### 6. Accessing the Authenticated Principal Anywhere

Downstream services, processors, and handlers access the current user via `sessionUserStore`:

```typescript
import { getSessionUserFromStore } from '@common/context/session-user.store';

@CommandHandler(DeleteUserCommand)
export class DeleteUserHandler {
  async handle(command: DeleteUserCommand) {
    const actor = getSessionUserFromStore();
    console.log('User action executed by:', actor?.id, 'in tenant:', actor?.tenant);
  }
}
```

### Environment Variables Reference

| Variable | Required | Description | Example |
|---|---|---|---|
| `JWT_SECRET` | Optional* | HMAC secret used to sign and verify local tokens | `super-secret-key-at-least-32-chars-long` |
| `JWT_PUBLIC_KEY` | Optional* | RSA/ECDSA SPKI public key (PEM) for verifying external asymmetric tokens | `-----BEGIN PUBLIC KEY-----\nMIIBIj...\n-----END PUBLIC KEY-----` |
| `JWT_PUBLIC_KEY_ALG` | Optional | Algorithm for `JWT_PUBLIC_KEY` (default: `RS256`) | `RS256` |
| `JWT_ISSUER` | Optional | Expected `iss` claim | `users-api` |
| `JWT_AUDIENCE` | Optional | Expected `aud` claim | `nestjs-pipeline` |
| `JWT_ALGORITHMS` | Optional | Comma-separated list of allowed algorithms | `HS256,RS256` |
| `API_CLIENTS` | Optional | JSON array of authorized API client identities | `[{"id":"svc","key":"k","tenants":["tenant"]}]` |
| `AUTH_LOGIN_CODE` | Required for login | One-time code verified during `POST /auth/login` | `123456` |
| `SESSION_SECRET` | Fastify only | 32-byte secret for Fastify secure-session cookies | `at-least-32-characters-secret-string!` |

*\* Note: At least one of `JWT_SECRET` or `JWT_PUBLIC_KEY` must be set if Bearer token authentication is enabled.*

## Pipeline composition demonstrated

Global and per-handler examples exercise:

- `@nestjs-pipeline/core` — pipeline execution and logging
- `@nestjs-pipeline/correlation` — HTTP and async correlation propagation
- `@nestjs-pipeline/zod` — request parsing/validation
- `@nestjs-pipeline/opentelemetry` — trace and metrics behaviors
- `@nestjs-pipeline/casl` — ABAC authorization
- `@nestjs-pipeline/resilience` — retry/circuit-breaker/timeout policies
- `@nestjs-pipeline/cache` — cache behavior infrastructure
- `@nestjs-pipeline/feature-flags` — OpenFeature gating
- `@nestjs-pipeline/deadletter` — failed-request capture
- `@nestjs-pipeline/rate-limit` — `rate-limiter-flexible` integration
- `@nestjs-pipeline/audit` — redacted audit records
- `@nestjs-pipeline/idempotency` — atomic duplicate exclusion and replay
- `@nestjs-pipeline/ddd-core` — entities, outcomes, events, and repository helpers

The application also has its own tenant-aware DDD repository cache so user/role write invalidation has a single clear target. In addition, `ObservabilityModule` configures `tenantIdFactory` so that the active tenant schema is explicitly conveyed through `IPipelineContext.tenantId`, allowing command handlers, rate limiters, and idempotency key factories to access the tenant cleanly from context without direct ambient coupling.

## Tests

From the repository root, `pnpm test` runs the workspace build (including this
application's TypeScript checks), all unit/integration tests, and this application's
existing E2E suite. All three stages run even if an earlier stage fails; the final
summary reports each result and the command exits unsuccessfully if any stage fails.

E2E tests require a running Docker-compatible container runtime. Testcontainers
starts a disposable real Redis instance; infrastructure failures fail the suite
rather than skipping tests. Workspace packages must be built before running E2E
independently.

To run individual checks from this directory:

```bash
pnpm test
pnpm build
pnpm test:e2e
```

The e2e harness creates disposable tenant databases directly from the current MikroORM metadata. Migration tests separately verify that the fresh migration creates the intended current schema and seed. The sample does not test upgrades from historical migration states.
