# @nestjs-pipeline/ddd-api

## Scope of this example

This application demonstrates selected library capabilities. Its current call
sites do not define which package APIs, adapters or future integrations are useful.
Repository caches serve persistence reads; pipeline caches can serve composed or
aggregate application query results. Registering a module makes infrastructure
available but does not demonstrate an active handler policy. See
[AGENTS.md](../AGENTS.md) and the
[architecture skill](../.agents/skills/nestjs-pipeline-architecture/SKILL.md)
before changing cache placement or removing a feature based on this example.

Disposable reference application demonstrating the `@nestjs-pipeline/*` packages with NestJS CQRS, MikroORM, CASL, Zod, caching, tracing, rate limiting, audit, idempotency, feature flags, resilience, correlation IDs, and dead-letter handling.

This directory is a **demo**, not a migration-compatibility target. Its database history may be reset whenever the sample schema changes. Do not use its migration files as an upgrade path for a real application.

## Fresh setup

Start from an empty database/schema:

```bash
cd api
pnpm install
pnpm build
cp .env.example .env
pnpm db:migrate
pnpm dev
```

`db:migrate` applies pending migrations for every configured tenant: the initial migration creates the schema, inserts the demo seed, and materializes its permission rules.

| Command | Purpose |
| --- | --- |
| `pnpm db:migrate` | Apply pending migrations in every tenant |
| `pnpm db:revert` | Revert the last migration in every tenant |
| `pnpm permissions:rebuild` | Rebuild every user's materialized permission rules in every tenant, one transaction per batch of 500 users |
| `pnpm permissions:verify` | Print, per tenant, the users whose materialized rules differ from their source tables; exits non-zero on any drift |
| `pnpm sessions:purge` | Delete expired and long-revoked login sessions (and their refresh-token history) in every tenant |

**Database setup** (rollout order): `pnpm db:migrate` → `pnpm permissions:verify` must exit 0 → start the application. If verify reports drift, run `pnpm permissions:rebuild`, verify again, and only then start. Run `permissions:verify` after any seed or bulk import.

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

The PostgreSQL options set both the ORM `schema` and `migrations.schema` to the
selected tenant. MikroORM uses the latter to scope unqualified migration SQL
through the transaction's `search_path` and keep migration history per tenant.
This applies to both migration and rollback.

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
- `user_permission_rules` (second migration; see [Permission source](#permission-source))

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
- `user_denied_capabilities`: Grace receives an explicit `User/read` denial; `CaslPermissionSource` forces capabilities from the denied collection to inverted rules.

## Running requests

The sample supports Express by default and Fastify with `ADAPTER=fastify`.

Every routed request needs `x-tenant-schema`. Protected routes additionally need a bearer JWT, API credentials, or (Fastify only) the secure-session cookie.

Example shape:

```bash
curl http://localhost:3000/users \
  -H 'x-tenant-schema: tenant' \
  -H 'Authorization: Bearer <token>'
```

`POST /auths/login` returns the principal profile and a short-lived access token, and sets the refresh token as an `HttpOnly` cookie (see [Authentication](#authentication)). With Fastify + `SESSION_SECRET` (64-character hex string representing a 32-byte key), the access token is also kept in `@fastify/secure-session`.

## Authentication

| Item | Contract |
| --- | --- |
| Access token | HS256 JWT, lifetime `ACCESS_TOKEN_TTL_SECONDS` (default 300, 60–3600). Claims: `sub`, `sid` (session id), `tenant`, `principalType: 'user'`, `iat`, `exp`, `jti`, plus `iss`/`aud` when configured. No permission or profile claims. Verified statelessly: no per-request session lookup. |
| Refresh token | 32 random bytes, base64url. Only its SHA-256 hex digest is stored. The session lifetime `REFRESH_TOKEN_TTL_SECONDS` (default 14 days, minimum 3600) is fixed at login; rotation does not extend it. |
| Transport | Only as the `refresh_token` cookie: `HttpOnly; Secure; SameSite=Strict; Path=/auths`, on both adapters. Never in a response body and never readable by scripts. |
| Session | One `auth` row per login, versioned; saves are version-conditioned (`optimisticUpdate`). |
| Rotation | Every successful `POST /auths/refresh` returns a new access token and sets a new refresh cookie; the presented token becomes the session's previous token and is recorded in `auth_consumed_refresh_tokens`. |
| Grace window | Presenting the immediately previous token within `REFRESH_REUSE_GRACE_SECONDS` (default 30, 0–120) of its rotation answers 200 with a new access token for the same session, without rotating and without `Set-Cookie`. |
| Reuse detection | Presenting any earlier token of a session (the previous one after the grace window, or any older generation) revokes the session: 401 `{ "code": "refresh_reused" }`. An unknown, expired or revoked token: 401 `{ "code": "refresh_invalid" }`. |
| Rate limit | Login is throttled per tenant and client IP (20/min across claimed emails), refresh per tenant and client IP (60/min, never per token), user creation per acting principal (60/min). Limits are per process and do not provide a per-account limit across source addresses. Clients sharing an IP also share its quota. Set `TRUST_PROXY` behind a load balancer; otherwise every client shares the proxy's address and one bucket. |
| Logout | `POST /auths/logout` revokes the cookie's session, clears the cookie and answers 204, also for a missing or unknown cookie. An access token already issued stays valid until its `exp`. |
| User deletion | Sessions and their history are deleted by FK cascade; the permission source denies the deleted user on the next request. |

Endpoints (tenant resolution works as for login; `x-tenant-schema` is required):

| Route | Body | Answer |
| --- | --- | --- |
| `POST /auths/login` | `{ email, code }` | 200 `{ id, principalType, tenant, email, department, accessToken, accessTokenExpiresAt }` and `Set-Cookie: refresh_token=…` |
| `POST /auths/refresh` | none; reads the cookie | the same body; `Set-Cookie` only when the token rotated |
| `POST /auths/logout` | none; reads the cookie | 204, clears the cookie |

`accessTokenExpiresAt` is a Unix timestamp in milliseconds. Send refresh and logout without an `Authorization` header: an expired bearer token is rejected before the route runs.

**CSRF.** `SameSite=Strict` plus a body-less refresh that answers only in the response body (unreadable cross-site) is the protection; no CSRF token is used.

**Client coordination.** Browser clients refresh single-flight: one in-flight refresh shared by every caller, across tabs through the Web Locks API or an equivalent. The grace window only absorbs uncoordinated clients; it is not the coordination mechanism.

```ts
let inFlight: Promise<string> | undefined;

export function accessToken(): Promise<string> {
  inFlight ??= navigator.locks
    .request('auth-refresh', async () => {
      const res = await fetch('/auths/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-tenant-schema': tenant },
      });
      if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
      return (await res.json()).accessToken as string;
    })
    .finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}
```

**Session cleanup.** The history table grows by one row per refresh and is deleted with its session. Run `pnpm sessions:purge` on a schedule: it deletes, per tenant and in batches, sessions whose `expires_at` has passed or whose `revoked_at` is older than `REFRESH_TOKEN_TTL_SECONDS`.

### Permissions in the access token (opt-in)

With `PERMISSIONS_IN_ACCESS_TOKEN=true`, login and refresh copy the user's materialized rules into the access token as `perms` (compact capability strings, all direct rules then all inverted, from `user_permission_rules`) together with `department`, the only principal attribute a placeholder reads today (`${user.id}` resolves from `sub`). `JwtAuthenticator` parses them into the session user's `grants` (a malformed entry is a 401), and `CaslPermissionSource` then answers without any query. With the flag off, `perms`/`department` in an already issued token are ignored, so turning it off takes effect immediately.

If the signed token would exceed `ACCESS_TOKEN_MAX_BYTES` (default 2500), it is re-issued without `perms` and `department` and a warning names the user id and rule count (never the token or the rules); that user's requests use the database path. On Fastify the token also sits in the encrypted session cookie: session JSON → nonce + MAC → base64 → URL encoding, which also repeats the tenant. The limit budgets that serialized cookie, not the JWS. The ciphertext is random and URL encoding turns each `+` and `/` into three bytes, so the cookie length varies by about 170 bytes between logins: with a 2600-byte token about 1% of logins produced a `Set-Cookie` over 4096 bytes, and with 2500 none of 20,000 did. `src/http-platform.spec.ts` checks 1,000 logins at the limit, and the cookie-budget e2e test checks a real one. Lower the limit for long tenant names. Requests authenticated by the Fastify session cookie read permissions from the database; bearer requests use the token path.

| | Database path (default) | Token path |
| --- | --- | --- |
| DB reads per request for authorization | 1 parallel round-trip | 0 |
| Permission change, user deletion, department change | next request | next refresh (≤ `ACCESS_TOKEN_TTL_SECONDS`) |
| Rule visibility | server only | readable by the client (the JWS is signed, not encrypted) |
| Token size | small | larger; above `ACCESS_TOKEN_MAX_BYTES` falls back to the database path per user |

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
  ├─ 3. Verify API-client credentials (ApiClientAuthenticator)
  │
  ▼ Sets req.sessionUser = principal (or undefined for anonymous callers;
    throws 401 if credentials are provided but invalid, expired, or tenant-mismatched)
SessionUserContextInterceptor (APP_INTERCEPTOR)
  │
  ▼ sessionUserStore.run(req.sessionUser, () => next.handle())
Downstream Pipeline (Controllers → CQRS Bus → CASL → Audit → DB)
```

### Architecture Components

1. **`AuthSessionGuard` (`APP_GUARD`)**: Decides **who you are**. It executes early in the NestJS request lifecycle (before interceptors, pipes, or route handlers) and delegates credential resolution to:
   - **`JwtAuthenticator`**: Parses `Authorization: Bearer <token>` (case-insensitively, accepting `Bearer` or `bearer`). Supports both symmetric (`JWT_SECRET`) and asymmetric (`JWT_PUBLIC_KEY`) keys. Asymmetric SPKI keys are memoized upon first parse to eliminate repetitive ASN.1 DER parsing. Validates tenant alignment, reads no permissions from the token, and explicitly tags the authenticated principal as `principalType: 'user'`.
   - **`ApiClientAuthenticator`**: Authenticates machine-to-machine callers using `x-api-id` and `x-api-key` headers against configured `API_CLIENTS`. Uses constant-time fixed-length SHA-256 digest comparison (`timingSafeEqual`) to prevent timing side-channel leaks. Operates completely statelessly, attaches the client's configured rules as `grants`, and explicitly tags the principal as `principalType: 'service'`.
   - **`RequestPrincipalResolver`**: Lean orchestrator coordinating priority resolution (Cookie $\rightarrow$ JWT $\rightarrow$ API Key $\rightarrow$ Anonymous fallback).

   *Note on Anonymous Access*: `AuthSessionGuard` does **not** reject unauthenticated requests; it resolves the caller to `undefined` (anonymous) and permits the request to continue. Rejections (HTTP 401 Unauthorized) only occur when credentials are provided but fail verification (e.g. expired JWT, invalid API key, or tenant mismatch). Downstream pipeline behaviors, such as `CaslBehavior` and `CaslAuthorizer`, enforce endpoint authorization and reject unauthorized callers with HTTP 403 Forbidden.
2. **`SessionUserContextInterceptor` (`APP_INTERCEPTOR`)**: Decides **the execution scope**. A single-responsibility interceptor that reads `req.sessionUser` (populated by the guard) and invokes `sessionUserStore.run(req.sessionUser, () => next.handle())`. In NestJS 11.2.1, `InterceptorsConsumer` binds stream continuations using `defer(AsyncResource.bind(...))`, guaranteeing that the `AsyncLocalStorage` context established by `run()` persists across all downstream asynchronous operations, CQRS handlers, and pipeline behaviors without cross-request context bleeding.
3. **`SessionService`**: Presentation-layer service for the `@fastify/secure-session` cookie: saving the access token and `{ id, principalType, tenant, exp }` on login and refresh (`saveSession`), clearing it on logout or expiry (`clearSession`), and checking expiry (`isExpired`). The refresh cookie is handled by `controllers/refresh-cookie.ts`.
4. **`UserLoginService`**: Application service for login credential verification (`POST /auths/login`) and signing access tokens for a session, decoupled from HTTP cookies and session storage.
5. **`toSessionRes` Mapper**: Clean presentation mapper converting internal `CreateAuthResult` application results into public `SessionResponse` HTTP response contracts.
6. **Session persistence**: `CreateAuthCommandRepository` inserts a session, `UpdateAuthCommandRepository` saves rotation and revocation version-conditioned, and `AuthSessionsRepository` (`AUTH_SESSIONS` port) finds sessions by refresh-token hash and records rotated-away hashes. Sessions are never cached. `AuthSessionRevocationService.revoke` coordinates durable revocation for refresh reuse and logout, reloads on version conflicts, and returns the saved aggregate or `null` if concurrently deleted. Exhausted conflicts propagate; handlers retain their own missing-session and event-publication semantics.
7. **`CaslPermissionSource`**: Request-scoped `ICaslPermissionSource` bound through `AuthorizationModule` and `CaslModule.forRoot({ imports: [AuthorizationModule], permissionSource: { useExisting: CaslPermissionSource } })`. For a `user` principal it reads the user row (a deleted user is unauthenticated) and the materialized `user_permission_rules` in one parallel round-trip (see [Permission source](#permission-source)); the principal carries `department` for `${user.department}` placeholders. A `service` principal uses its `grants` without touching the users tables. Unclassified principals are unauthenticated.

### Authorization

Authorization runs in two stages, both through `@nestjs-pipeline/casl`:

1. **Type level, before the handler.** Handlers declare requirements with `@UsePipeline(requires({ action, subject }))`. `CaslBehavior` loads the caller through `CaslPermissionSource`, builds the ability (every deny after every allow) and rejects with `UnauthorizedActionException` (HTTP 403 via `UnauthorizedActionFilter`) before cache or idempotency can short-circuit.
2. **Entity level, in the handler, after the authoritative load.** Commands call `authorizer.authorize(action, aggregate, acceptedFields)`, a void permit-or-throw check, before mutating and saving. Queries return read models built with `authorizer.project('read', entity, candidate)`.

```typescript
@CommandHandler(UpdateUserCommand)
@UsePipeline(requires({ action: APP_ACTIONS.UPDATE, subject: APP_SUBJECTS.USER }))
export class UpdateUserHandler extends CommandBaseHandler<UpdateUserCommand, User> {
  async handle(command: UpdateUserCommand): Promise<User> {
    const user = await this.commandRepository.findById(command.id);
    if (!user) throw new EntityNotFoundException('User', command.id);
    this.authorizer.authorize('update', user, command.getUpdateFields(UpdateUserCommand.MUTABLE_FIELDS));
    user.update(command);
    await this.commandRepository.save(user);
    return user;
  }
}
```

- **Read models.** `GetUserHandler`/`GetRoleHandler` return `UserReadModel`/`RoleReadModel` (`Projected<…>`: any field may be absent). Lists filter with `can('read', item)` and project each row; this filters the loaded collection in memory and is not authorized pagination.
- **Fresh reads under conditional rules.** When the caller's `read` rules for the subject have conditions (`readDependsOnEntityState`), the handler re-issues the query with `refresh: true`, which bypasses the repository cache and asks the ORM for a refreshed row, so a cached snapshot cannot decide access. Unconditional reads may be served from the repository cache.
- **Write responses.** `POST`/`PATCH` on users and roles answer with a fresh `GetUserQuery`/`GetRoleQuery` for the written id, so the body carries only what the caller may read afterwards. A write-only caller receives `{}` with the normal success status; a committed write is never reported as failed because its result is unreadable. Only `UnauthorizedActionException` is absorbed: any other failure of that read propagates as an error although the write has committed. An idempotent replay re-reads the same way. `DELETE` stays `204`.
- **Create idempotency.** `POST /users` and `POST /roles` deduplicate a client operation, not a business object. A client that may retry sends an `Idempotency-Key` header (1-255 characters) and reuses it for retries of that operation: a retry replays the first result, and the same key with a different body answers `422 key_reuse`. A new operation uses a new key, so creating a user again after deleting it runs the handler. Without the header nothing is deduplicated and the unique email or role name answers a duplicate (`409`).
- **Service principals.** Each `API_CLIENTS` entry lists `rules` as compact capability strings (`[!]subject|action[|conditions[|fields[|reason]]]`), parsed at startup; a malformed rule fails boot. Those rules are the client's complete authorization.

---

### Practical Examples

#### 1. User Login & Token Issuance

Users authenticate via `POST /auths/login` using their email and the login code. The demo accepts one shared code (`AUTH_LOGIN_CODE_SHA256`, or `AUTH_LOGIN_CODE` outside production) for every user, so anyone who knows it can sign in as any account; it stands in for a per-user OTP or identity provider and is refused in production unless `AUTH_SHARED_LOGIN_CODE=true`:

```bash
curl -X POST http://localhost:3000/auths/login -c cookies.txt \
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
  "id": "019488e0-0000-7000-8000-000000000001",
  "tenant": "tenant",
  "email": "alice+tenant@seed.local",
  "principalType": "user",
  "department": null,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ...",
  "accessTokenExpiresAt": 1741258800000
}
```

The response also carries `Set-Cookie: refresh_token=…; Path=/auths; HttpOnly; Secure; SameSite=Strict`. Exchange it for a new access token with `curl -X POST http://localhost:3000/auths/refresh -b cookies.txt -c cookies.txt -H "x-tenant-schema: tenant"`.

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
  -H "x-api-key: <secret>"
```

Configure authorized clients in `.env` as a JSON array:

```env
API_CLIENTS='[{"id":"reporting-service","key":"<secret>","tenants":["tenant"],"rules":["User|read|*|id,username","Role|read|*"]}]'
```

#### 4. Defining & Executing a CQRS Command with Pipeline Behaviors

Commands use `createCommand()` to guarantee Zod schema enforcement, idempotency, and audit logging:

```typescript
// 1. Command Definition (createCommand)
export const CreateUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  department: z.string().min(3).max(50).optional(),
  idempotencyKey: IdempotencyKeySchema.optional(), // from the Idempotency-Key header
});

export class CreateUserCommand extends createCommand(CreateUserSchema, BaseCommand) {}

// 2. Command Handler with Pipeline Behaviors
@CommandHandler(CreateUserCommand)
@UsePipeline(
  logging({ requestResponseLogLevel: 'log' }),
  requires({ action: APP_ACTIONS.CREATE, subject: APP_SUBJECTS.USER }),
  featureFlag({ flag: 'user-registration' }),
  rateLimit({ keyFactory: createUserRateLimitKey }),
  idempotent({
    keyFactory: createUserIdempotencyKey,
    replayScopeFactory: createUserReplayScope,
  }),
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
@UsePipeline(requires({ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER }))
export class GetUserHandler implements IQueryHandler<GetUserQuery, UserReadModel | null> {
  constructor(
    @Inject(QUERY_REPOSITORY.getUser) private readonly queryRepository: IQueryRepository<GetUserQuery, User | null>,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetUserQuery): Promise<UserReadModel | null> {
    const user = await this.queryRepository.find(query);
    return user ? projectUserRead(this.authorizer, user) : null;
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

Refresh validates the presented token before preparing the user and access token.
Rotation and consumed-token recording happen only after preparation succeeds, with
session expiry checked again before persistence. Previous-token reuse outside grace
and historical-token reuse persist revocation with bounded conflict retries. A lost
rotation race reloads the session; a token displaced by multiple rotations is treated
as reuse. A process or network failure after commit can still prevent delivery of the
new cookie; the grace response does not reconstruct that cookie.

#### 7. User Logout & Session Revocation

Logging out revokes the session of the refresh cookie and clears the cookies:

```bash
curl -X POST http://localhost:3000/auths/logout -b cookies.txt \
  -H "x-tenant-schema: tenant"
```

Under the hood:
1. `AuthsController.logout` reads the `refresh_token` cookie and dispatches `new DeleteAuthCommand({ refreshToken })`; it clears the refresh cookie and the Fastify session on success or a missing/unknown token. Persistence failures propagate without reporting a successful logout.
2. `DeleteAuthHandler` finds the session by the token's hash (`AUTH_SESSIONS`), calls `auth.revoke(now)` and saves it version-conditioned. Revocation retries version conflicts up to three attempts; exhaustion propagates the conflict.
3. Later refreshes with any token of that session answer 401 `refresh_invalid`; other sessions of the user stay active. An access token already issued remains valid until it expires.

#### 8. Pipeline Caching with CacheBehavior

While entity query repositories use `@FromCache`, CQRS query handlers can also declaratively cache aggregate query results using `CacheBehavior` from `@nestjs-pipeline/cache`:

The disabled example uses a raw tuple because no cache key is configured. Use
`cache({ key, ...options })` when enabling caching, or `inheritModuleKey: true`
when a suitable key is configured in module defaults.

```typescript
import { Inject } from '@nestjs/common';
import type { IQueryRepository } from '@cqrs-ddd/core/application';
import type { Role } from '../../domain/models/role.entity';
import { QUERY_REPOSITORY } from '../../persistence/repository.tokens';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { CacheBehavior } from '@nestjs-pipeline/cache';
import { CaslAuthorizer, requires } from '@nestjs-pipeline/casl';
import { projectRoleRead, type RoleReadModel } from '../../application/role-read-model';
import { GetRolesQuery } from './get-roles.query';

@QueryHandler(GetRolesQuery)
@UsePipeline(
  requires({ action: 'read', subject: 'Role' }),
  [CacheBehavior, {
    ttl: 30_000, // 30-second cache TTL
    // Safe baseline: do not enable this protected-result cache until the
    // application supplies a key covering tenant, principal and permissions,
    // plus an invalidation/freshness policy. Correlation ID is not isolation.
    condition: () => false,
  }],
)
export class GetRolesHandler implements IQueryHandler<GetRolesQuery, RoleReadModel[]> {
  constructor(
    @Inject(QUERY_REPOSITORY.getRoles)
    private readonly queryRepository: IQueryRepository<GetRolesQuery, Role[]>,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetRolesQuery): Promise<RoleReadModel[]> {
    const roles = await this.queryRepository.find(query);
    return roles
      .filter((role) => this.authorizer.can('read', role))
      .map((role) => projectRoleRead(this.authorizer, role));
  }
}
```

> [!WARNING]
> **Authorization & Cache Security Scope**:
> When a query handler executes entity-level or field-level authorization (such as `this.authorizer.authorize('read', role)`), cached responses must never be shared across principals using an unpartitioned cache key.
>
> Correlation IDs may be supplied or reused and do not isolate principals. Before enabling the protected-result example above, provide an explicit `key` factory covering tenant, principal type/ID and effective permissions, and an invalidation/freshness policy. Fail closed on missing required context. A global type-level CASL check alone does not reproduce the handler's entity/field authorization.
>
> Use `createPartitionedCacheKeyFactory` from `@nestjs-pipeline/cache`. It partitions every dimension that influences the authorized response (`tenantId`, principal ID, role/capability scope, payload digest), escapes each segment so `a:b` + `c` cannot collide with `a` + `b:c`, and fails closed with `MissingCachePartitionError` on missing tenant or principal context — never falling back to `'default'`.

#### 9. Composed Read Models & Authoritative Reads

`GetUserOverviewHandler` composes a `User` with its assigned `Role` names and additional capabilities into `UserOverviewDto`.

- **Authoritative read**: the handler loads the user through the query repository port with `new GetUserQuery({ userId }, { refresh: true })`. `@FromCache` skips the repository snapshot and the ORM reads with `{ refresh: true }`, so the authorization decision does not rely on a possibly stale cached department. This is a fresh read, not a transaction: persistence, the decision and cache maintenance remain separate steps.
- **Two authorization stages**: `CaslBehavior` checks `read User` at type level. After the load, `project('read', user, candidate)` evaluates conditions and field rules against the persisted user, so the composed response cannot be returned without that entity-level check.
- **Related resources**: a user's roles and additional capabilities are a separate grant from their profile, carried by the `UserCapabilities` subject of the **loaded** user id. They are read only when `can('read', userCapabilitiesSubject(user.id))` allows it, so a rule such as `UserCapabilities|read|{"userId":"${user.id}"}` grants a principal their own permissions without exposing anyone else's. Absent such a grant both fields are omitted and neither port is queried. The loaded assignments are then projected through that subject (`project('read', permissions, { roles, additionalCapabilities })`), so field rules on `UserCapabilities` (`roles`, `additionalCapabilities`, `additionalCapabilities.0.action`) apply; denied capabilities are never part of the candidate, and a masked slot is never rebuilt from the raw assignments. Each remaining role is loaded through the roles query port and kept only if `can('read', role)` and `can('read', role, 'name')` pass; a role that cannot be loaded is omitted.
- **Final projection**: `project('read', user, candidate)` applies field and descendant rules (`roles.0`, `capabilities.0`) to the composed candidate, masking denied array items with `null`. It does not authorize related records; the steps above do.
- **Cache partition**: the response cache key contains the tenant, the principal type and ID from the CASL principal that built the ability (`getCaslPrincipal`), a digest of the effective rules, the policy version and the query payload. It fails closed when any of these is missing.
- **Cache eligibility**: the response cache is bypassed when the caller has conditional `read` rules for `User`, `Role`, `UserCapabilities` or `all`, because a cache hit would skip evaluating the loaded entities. Unconditional scopes are cached for 60 seconds, so ordinary response content can be stale for that period; authorization for such scopes does not depend on entity state.

### Environment Variables Reference

| Variable | Required | Description | Example |
|---|---|---|---|
| `JWT_SECRET` | Optional* | HMAC secret used to sign and verify local tokens | `super-secret-key-at-least-32-chars-long` |
| `JWT_PUBLIC_KEY` | Optional* | RSA/ECDSA SPKI public key (PEM) for verifying external asymmetric tokens | `-----BEGIN PUBLIC KEY-----\nMIIBIj...\n-----END PUBLIC KEY-----` |
| `JWT_PUBLIC_KEY_ALG` | Optional | Algorithm for `JWT_PUBLIC_KEY` (default: `RS256`) | `RS256` |
| `JWT_ISSUER` | Optional | Expected `iss` claim | `users-api` |
| `JWT_AUDIENCE` | Optional | Expected `aud` claim | `nestjs-pipeline` |
| `JWT_ALGORITHMS` | Optional | Comma-separated list of allowed algorithms | `HS256,RS256` |
| `API_CLIENTS` | Optional | JSON array of API clients; `rules` are capability strings parsed at startup (a malformed rule fails boot) | `[{"id":"svc","key":"<secret>","tenants":["tenant"],"rules":["User|read|*"]}]` |
| `ACCESS_TOKEN_TTL_SECONDS` | Optional | Access-token lifetime, 60–3600 (default 300); invalid values fail boot | `300` |
| `REFRESH_TOKEN_TTL_SECONDS` | Optional | Session lifetime fixed at login, ≥ 3600 (default 1209600) | `1209600` |
| `REFRESH_REUSE_GRACE_SECONDS` | Optional | Window for the immediately previous refresh token, 0–120 (default 30) | `30` |
| `TRUST_PROXY` | Optional | Unset: off. Otherwise passed to Express `trust proxy` / Fastify `trustProxy` (`true`, a hop count, or an address list) so `req.ip` is the client | `loopback` |
| `PERMISSIONS_IN_ACCESS_TOKEN` | Optional | `true` copies the user's rules into access tokens; `false` (default) ignores them | `false` |
| `ACCESS_TOKEN_MAX_BYTES` | Optional | Largest access token that may carry permissions, 1024–16384 (default 2500) | `2500` |
| `AUTH_LOGIN_CODE_SHA256` | Required for login in production | SHA-256 hex digest of the shared demo login code accepted for every user | `<64 hex characters>` |
| `AUTH_LOGIN_CODE` | Non-production alternative | Plaintext shared demo login code; rejected in production | `123456` |
| `AUTH_SHARED_LOGIN_CODE` | Required for login in production | `true` acknowledges that one code signs in any account; without it production login fails | `true` |
| `SESSION_SECRET` | Fastify only | 64-character hex string (32 bytes) for `@fastify/secure-session` cookies | `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` |

*\* Note: At least one of `JWT_SECRET` or `JWT_PUBLIC_KEY` must be set if Bearer token authentication is enabled.*

## Permission source

Human users' rules are materialized per rule and per user in `user_permission_rules`:

| Column | Meaning |
| --- | --- |
| `user_id`, `position` | Primary key; positions start at 1 per user |
| `source` | `role`, `additional` or `denied` |
| `role_id` | Set only for `role` rows |
| `capability_id` | The capability the rule was copied from |
| `subject`, `action`, `conditions`, `fields`, `inverted`, `reason` | Copied verbatim from `capabilities`; `${user.<path>}` placeholders stay uninterpolated |

- **Ordering contract.** `UserPermissionsProjector` writes role rules ordered by role **id** (never by name, so a rename changes nothing) and, within a role, by capability id; then additional rules; then denied rules, each by capability id. Denied rows are always `inverted`. `CaslPermissionSource` reads the rows with `ORDER BY inverted, position`, together with the user row, in one parallel round-trip; no cache stands in front of them. `buildAbility` applies every deny after every allow.
- **Cascades.** `user_id`, `role_id` and `capability_id` reference their tables `ON DELETE CASCADE`. Deleting a user, role or capability removes exactly the rows derived from it in the same statement; an identical rule granted by another role keeps its own row. Cascades can leave gaps in `position`, which is harmless.
- **Writer rule.** Every other change to `user_roles`, `role_capabilities`, `user_additional_capabilities`, `user_denied_capabilities` or a capability's content must call `UserPermissionsProjector.rebuild(em, affectedUserIds)` **in the same transaction** (the projector is exported by `AuthorizationModule`). No such command exists today; renaming a role changes no rule. A writer that skips the rebuild leaves the table drifted until `permissions:verify` reports it and `permissions:rebuild` repairs it.
- **Drift check.** `findDrift` compares stored and expected rows as sequences ordered by `inverted, position`, on origin and rule columns only, never on absolute positions.

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
- `@cqrs-ddd/core` — entities, aggregate-bearing command results, events, and repository helpers

### Telemetry bridge

The add-ons publish their decisions as `context.items` entries and take no
OpenTelemetry dependency, which is what lets them be installed one at a time.
Nothing therefore writes those decisions to a span by itself. `ObservabilityModule`
registers [`TelemetryBridgeBehavior`](src/infrastructure/behaviors/telemetry-bridge.behavior.ts),
which reads them on unwind and adds `feature_flag.*`, `cache.hit`,
`idempotency.*`, `rate_limit.remaining_points` and `dead_letter.captured` to the
request span. It sits inside `TraceBehavior` and outside the add-ons, so every
inner behavior has published before it reads and the tracer reads the merged bag
after it returns.

An absent item means the behavior did not run, and nothing is written for it: a
fabricated `cache.hit=false` would be indistinguishable from a real miss. The
cache key is deliberately not an attribute — it carries tenant and principal and
is unbounded.

The application also has its own tenant-aware DDD repository cache so user/role write invalidation has a single clear target. In addition, `ObservabilityModule` configures `tenantIdFactory` so that the active tenant schema is explicitly conveyed through `IPipelineContext.tenantId`, allowing command handlers, rate limiters, and idempotency key factories to access the tenant cleanly from context without direct ambient coupling. `TenantScopeBehavior` from `@nestjs-pipeline/tenant` (the first global behavior) runs every pipeline execution inside `@cqrs-ddd/core`'s tenant scope (`runWithTenant`), so repository cache keys (`filterCacheKey`) take the same tenant without it being passed at each call site.

## Tests

From the repository root, `pnpm test` delegates to `test:unit`: persistence lint
followed by workspace unit/integration tests. It does not build packages or run
the separate E2E suite. Run `pnpm test:build` for workspace builds, `pnpm lint`
for workspace typechecks, and `pnpm test:e2e` for the application E2E suite.
A failed persistence lint stops `test:unit` before the tests start.

E2E tests require a running Docker-compatible container runtime. Testcontainers
starts disposable Redis and PostgreSQL instances; infrastructure failures fail the suite
rather than skipping tests. Workspace packages must be built before running E2E
independently.

To run individual checks from this directory:

```bash
pnpm test
pnpm build
pnpm test:e2e
```

The HTTP e2e harness creates disposable tenant databases directly from the current MikroORM metadata. The PostgreSQL migration E2E runs the real migration against two tenant schemas and verifies seed data, independent migration history, repeat execution, rollback, and preservation of the other tenant and public tables. The sample does not test upgrades from historical migration states.
