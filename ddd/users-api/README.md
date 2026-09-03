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

---

### Practical Examples

#### 1. User Login & Token Issuance

Users authenticate via `POST /auth/login` using their email and temporary login code:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "x-tenant-schema: tenant" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.test",
    "code": "123456"
  }'
```

Response:
```json
{
  "userId": "usr_alice_123",
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

Automated scripts, microservices, and external systems authenticate with static API credentials:

```bash
curl http://localhost:3000/users \
  -H "x-tenant-schema: tenant" \
  -H "x-api-id: reporting-service" \
  -H "x-api-key: secret-api-key-999"
```

Configure authorized clients in your `.env` file as a JSON array:

```env
API_CLIENTS='[{"id":"reporting-service","key":"secret-api-key-999","tenants":["tenant"],"capabilities":{"roles":["reporter"]}}]'
```

#### 4. Consuming Current User in Downstream Handlers

Any CQRS command/query handler, service, or pipeline behavior accesses the authenticated caller via the request-scoped store without passing user parameters down the stack:

```ts
import { getSessionUserFromStore } from '@common/context/session-user.store';

@CommandHandler(DeleteUserCommand)
export class DeleteUserHandler {
  async handle(command: DeleteUserCommand) {
    const actor = getSessionUserFromStore();
    console.log('Action performed by user:', actor?.id, 'in tenant:', actor?.tenant);
  }
}
```

---

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

The application also has its own tenant-aware DDD repository cache so user/role write invalidation has a single clear target.

## Tests

```bash
pnpm test
pnpm test:e2e
```

The e2e harness creates disposable tenant databases directly from the current MikroORM metadata. Migration tests separately verify that the fresh migration creates the intended current schema and seed. The sample does not test upgrades from historical migration states.
