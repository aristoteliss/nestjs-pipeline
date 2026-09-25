# Task Context

## Task

Get the repository ready to publish `ddd/core` as its own npm package, `@cqrs-ddd/core`,
completely independent of NestJS, plus two new shared packages, `@cqrs-ddd/uuidv7` and
`@cqrs-ddd/safe-stringify`, next to the 12 existing `@nestjs-pipeline/*` packages:

1. fix the known bugs in the packages and `ddd/core`;
2. add what the published packages are missing;
3. remove every NestJS and `@nestjs-pipeline/*` dependency from `ddd/core`;
4. give `ddd/core` the functionality it owns but which is currently implemented in users-api,
   and refactor it into reusable, framework-neutral form;
5. restructure `ddd/core` as a publishable package;
6. create `@cqrs-ddd/uuidv7` as the single UUIDv7 implementation that every package uses;
7. create `@cqrs-ddd/safe-stringify` as the one package for serialization that every
   package uses. It holds both the strict, key-sorted serializer (`stableStringify`,
   `toStrictJsonValue`), the log-safe serializer with redaction (`safeStringify`,
   `safeSanitize`, `redactValue`, `DEFAULT_REDACT_KEYS`, `REDACTED`), and the key-segment
   helpers (`joinKeySegments`, `escapeKeySegment`, `ABSENT_SEGMENT`);
8. migrate every framework-neutral helper shared by more than one package into these two
   packages (inventory in section H);
9. change the repository layout: `ddd/users-api` → `api/` and `ddd/core` →
   `packages/ddd-core`, after which the `ddd/` folder no longer exists.

Paths in this task are baseline paths. After D1 and D1a, read `ddd/core/` as
`packages/ddd-core/` and `ddd/users-api/` as `api/`.

**Non-negotiable:** `@cqrs-ddd/core` is independent of NestJS. No step may add a `@nestjs/*`
or `@nestjs-pipeline/*` import, dependency or peer to it; Nest integration lives in the
application (users-api). Section N removes the existing coupling, and N6/D2 enforce it.

Work happens in three gated phases (see Plan): first correctness in the current structure,
then rearrangement, then publish preparation. The numbering above is not the work order.

The owner merges and publishes manually; this task ends when everything is ready.

## Goal

Phase 1 end state (Gate 1), in the current folders:
- every bug below is fixed;
- `ddd/core` owns the section C functionality;
- `ddd/core` has no Nest or `@nestjs-pipeline/*` dependency, and no `dependencies` at all;
- all tests pass at the enforced 100% coverage.

The final state (Gate 2 and phase 3) is described below.

- `ddd/core` has no runtime, type or peer dependency on `@nestjs/*` or `@nestjs-pipeline/*`.
  - Its only `dependencies` are `@cqrs-ddd/uuidv7` and `@cqrs-ddd/safe-stringify` (both
    with zero dependencies). Its only peer is `@mikro-orm/core` (optional).
  - `/domain` uses `@cqrs-ddd/uuidv7`.
  - `/application` uses nothing external.
  - `/persistence` uses both `@cqrs-ddd` utilities, and MikroORM at runtime.
  - `/http` (C6) uses nothing external.

  All four entry points load in a consumer with no Nest installed. A lint rule enforces
  this for `@cqrs-ddd/core`, `@cqrs-ddd/uuidv7` and `@cqrs-ddd/safe-stringify`.
- `@cqrs-ddd/uuidv7` is the only UUIDv7 implementation in the repository.
  `@nestjs-pipeline/core`, `@nestjs-pipeline/correlation` and `@cqrs-ddd/core` take it from
  there, and their public `uuidv7`/`isUuidV7` exports stay as re-exports.
- `@cqrs-ddd/safe-stringify` is the only implementation of both serializers and of the
  key-segment helpers. Core, cache, idempotency, rate-limit, audit, deadletter,
  `@cqrs-ddd/core` and users-api take them from there.
  - Every cache key, idempotency fingerprint and stored snapshot stays byte-identical.
  - Every log, audit and dead-letter redaction behaves exactly as today.
- NestJS applications (users-api) keep working unchanged in behavior: Nest glue (DI
  providers, logger adapter, the HTTP exception filter) lives in the application, which
  configures and extends `ddd/core`. The tenant bridge, `TenantScopeBehavior`, is the
  `@nestjs-pipeline/tenant` package (T), the only `@nestjs-pipeline/*` package that
  depends on `@cqrs-ddd/core`.
- `ddd/core` owns its generic DDD and persistence building blocks:
  - persistence error translation;
  - the write-side base repository;
  - the tenant context error;
  - the MikroORM cache adapter;
  - the root-entity schema mapping;
  - a framework-neutral mapping of its errors to HTTP status codes.
- Every published package has enforced 100% coverage, declares its Node engine, and has a
  README that works on npmjs.com.
- Every Postgres and Redis adapter is exercised against a real backend at least once. The
  RabbitMQ transport keeps mocked tests only, by owner decision.
- No public API of the 12 packages breaks. For `ddd/core`, API changes are allowed only
  where Nest removal requires them, and each is listed in its README and release notes.

## Scope

In scope:
- the 12 packages in `packages/*`;
- the new `packages/uuidv7` and `packages/safe-stringify`;
- the new `packages/pipeline-tenant` (`@nestjs-pipeline/tenant`, section T);
- `ddd/core`;
- the `ddd/core` functionality currently implemented in users-api (section C);
- the users-api Nest glue that replaces what `ddd/core` loses (section N);
- repo scripts that build, check and pack packages;
- users-api tests needed to exercise package adapters.

Out of scope: new features other than the two helper packages (U, S),
`@nestjs-pipeline/tenant` (T), and the users-api code that moves into packages (B9–B11);
users-api
refactors beyond adopting the `ddd/core` and helper-package versions and the Nest glue;
merging or publishing.

## Current Status

In progress. Phase 1 complete and Gate 1 green on `5c94efee` (2026-09-25); phase 2: U1–U3, S1–S3, D1–D3 and T1–T3 done; next is D5. A1–A5, A7, B9–B11, N1–N6 and A6, B1–B4, B7, B8, C1–C8 and D4 done.
Section T (`@nestjs-pipeline/tenant`)
was added to phase 2 on 2026-09-24. Baseline `e60c689a` on branch `review`. Facts
verified on 2026-09-23 and 2026-09-24 by running commands (no code changed):

- **`ddd/core` tarball.** `pnpm pack` in `ddd/core` ships 27 `*.spec.ts` files, the
  TypeScript sources, `tsconfig*.json` and `vitest.config.ts`; `package.json` has no `files`.
- **`@Mutable()` on a static property.** It raises no error and writes its registry symbol
  onto the global `Function` (reproduced by calling the decorator with a class as target).
- **Nest coupling in `ddd/core` production code** (seven places):

  | File | Imports |
  | --- | --- |
  | `application/base.command.ts` | `type ICommand` from `@nestjs/cqrs` (an empty marker interface) |
  | `application/command-base.handler.ts` | `EventBus`, `type ICommand`, `type ICommandHandler` from `@nestjs/cqrs`; `EventBus` is only used for `publishAll` |
  | `persistence/decorators/Cache.ts`, `persistence/decorators/FromCache.ts`, `persistence/helpers/cache-owner.helper.ts` | `Logger` from `@nestjs/common` |
  | `persistence/helpers/cache-barrier.helper.ts` | `uuidv7` from `@nestjs-pipeline/core` (`ddd/core` has its own `domain/utils/uuidv7.ts`) |
  | `persistence/helpers/filter-cache-key.helper.ts` | `pipelineStore` (ambient tenant fallback), `stableStringify` and `type IPipelineContext` from `@nestjs-pipeline/core` |

  Declared `dependencies`: `@nestjs-pipeline/core`, `@nestjs-pipeline/correlation` (unused),
  `@nestjs/common`, `@nestjs/cqrs`.
- **Nest coupling in the users-api pieces `ddd/core` should own.** `MikroOrmCache` uses
  `@Injectable`, `@Inject`, `@Optional` and `Logger`. `DomainExceptionFilter` is a Nest
  `ExceptionFilter`. `requireTenantId` uses the `IPipelineContext` type. The others
  (`mapPersistenceError`, the write-side base repository, the root-entity schema mapping)
  have no Nest imports.
- **Coverage without enforced thresholds** (statements / branches / functions / lines):

  | Package | Stmts | Branch | Funcs | Lines |
  | --- | --- | --- | --- | --- |
  | `ddd/core` | 99.56 | 99.48 | 99.19 | 99.54 |
  | audit | 98.02 | 93.56 | 100 | 100 |
  | cache | 98.91 | 96.62 | 100 | 100 |
  | casl | 100 | 99.71 | 100 | 100 |
  | deadletter | 99.14 | 96.33 | 100 | 100 |
  | feature-flags | 98.92 | 92.55 | 100 | 100 |
  | idempotency | 100 | 99.51 | 100 | 100 |
  | opentelemetry | 99.15 | 92.85 | 100 | 100 |
  | resilience | 100 | 92.39 | 100 | 100 |
  | rate-limit | 100 | 100 | 100 | 100 |
  | zod | 100 | 100 | 100 | 100 |

  Core and correlation already enforce 100%.
- **No real-backend tests.** Nothing in `ddd/users-api/test` exercises these adapters
  against a real backend: `PostgresAuditSink`, `PostgresDeadLetterTransport`,
  `RabbitMqDeadLetterTransport`, `RedisIdempotencyStore`. The same gap hid the
  `PostgresIdempotencyStore.set()` bug. Their SQL column lists and placeholder counts do
  match their `CREATE TABLE` helpers, and JSONB values are stringified.
- **Package metadata.** No package declares `engines`; the root requires Node `>=22.0.0`. No
  package declares `exports` or `sideEffects`, and all imports match declared peers.
- **README links.** They use relative links outside the package (`../../LICENSE`,
  `../../COMMERCIAL_LICENSE.txt`, `../pipeline-*`, `../../README.md#...`), which break on
  npmjs.com. The cache README also links the internal `../../.agents/skills/...` file.

- **Package bug review (2026-09-24).** This conversation's findings were checked against
  the code on `publish` (`1abc4274`):
  - the `PostgresIdempotencyStore.set()` expiry bug is fixed and tested against real
    Postgres (`e60c689a`); `set()` now uses `now() + ($10 || ' milliseconds')::interval`
    like the other writes;
  - the misplaced `MetricsBehavior` and `ResilienceBehavior` JSDoc is fixed;
  - still open, and already task steps: the untested Postgres and Redis adapters (A6), the
    misplaced `PostgresIdempotencyStore` class JSDoc (B4), the correlation README install
    command (B7), README links on npmjs.com (B3), unenforced coverage (B1), and the
    behavior changes that need release notes (B5);
  - newly found: the `RedisIdempotencyStore.get()` inconsistency (added to A6);
  - the RabbitMQ transport's publish, confirm and backpressure handling reads correctly;
    it stays mocked-only by decision.

  No other significant package bug is known. The full correctness audit started on
  2026-09-23 was stopped before it produced results, so A6's real-backend tests are the
  main remaining check.
- **Plan verification (2026-09-24).** Each bug claim below was checked against the code:
  - A1 and A3: reproduced.
  - A4: confirmed by reading the code. `DomainExceptionFilter` is `@Catch(DomainException)`,
    has no branch for `MissingTenantContextError`, and returns 400 for unclassified
    `DomainException`s.
  - A5: a code-path inference.
  - A6: the gap is confirmed by grep.
  - users-api wires `BullMqDeadLetterTransport` as its dead-letter transport
    (`src/infrastructure/reliability.module.ts:43-51`), and nothing in users-api uses the
    RabbitMQ transport.
  - The correlation README's install command omits its required peers.
  - Every published package has `prepublishOnly: pnpm run rebuild`, but `ddd/core` has
    none.

## Plan

Three phases, strictly in order (owner, 2026-09-24):
1. make everything correct in the current structure;
2. rearrange (new packages, folder moves, renames) only after Gate 1 is green;
3. prepare the publish.

### Phase 1: fix, migrate and make independent, in the current structure

No folder moves, new packages or renames in this phase.

#### A. Bugs (each fixed with a regression test)

- [x] A1. **`ddd/core` ships its sources and specs.** Add
  `"files": ["dist", "README.md", "LICENSE", "COMMERCIAL_LICENSE.txt"]`.
  Verify: `pnpm pack` and `tar tzf` list only `dist/**`, README, licenses and package.json.
- [x] A2. **`ddd/core` declares Nest and pipeline packages as runtime dependencies.** Section
  N removes their use. Then remove all four from `dependencies`, so that after phase 1
  `ddd/core` has no `dependencies` at all and `@mikro-orm/core` is its only (optional)
  peer. In phase 2, U2 and S2 add `@cqrs-ddd/uuidv7` and `@cqrs-ddd/safe-stringify` as its
  only `dependencies`. Document that the root barrel and `/persistence`
  need MikroORM at runtime (`persistence/types/unix-timestamp.type.ts` extends MikroORM's
  `Type`).
- [x] A3. **`@Mutable()` on a static property** (`ddd/core/domain/decorators/Mutable.ts`).
  For a static property the target is the class, so `target.constructor` resolves to the
  global `Function`. Reject a function target with the existing
  `'@Mutable() supports instance properties only.'` TypeError.
  Verify: a spec expects the TypeError and no symbol on `Function`.
- [x] A4. **Missing tenant context answers 400 instead of 500.** This is a code-path
  inference; confirm it with a test first. `ddd/core`'s `MissingTenantContextError` extends
  `DomainException`, and `filterCacheKey`/`cacheKeyTemplate` throw it. users-api's
  `DomainExceptionFilter` sends every unclassified `DomainException` to 400. A missing tenant
  at that point is server misconfiguration: the tenant middleware already rejects
  invalid/unknown tenant headers with 400/403, and non-HTTP paths must configure a tenant.
  - Map `MissingTenantContextError` explicitly to 500 (see C6 and Decisions).
  - Then delete users-api's duplicate class (`common/cqrs/helpers/requireTenantId.helper.ts`,
    which extends `Error` and currently gives a plain 500) and use `ddd/core`'s.

  Verify: a filter spec and a request-level test both return 500. Done with C3 (see
  Modified Files).
- [x] A5. **Unguarded logger in `@Cache`'s outer catch** (reproduced on the old code; fixed in N3).
  `ddd/core/persistence/decorators/Cache.ts`, around line 291, runs only when a
  `logger.warn` inside an inner catch throws. Its own `logger.warn` is unguarded, so a
  throwing logger turns a durable write into an error. Guard it, never rethrow. Fix it
  together with N3.
  Verify: a spec with a throwing logger resolves the `save()` result.
- [x] A6. **Real-backend tests for the untested adapters** (BullMQ already has
  `test/bullmq-deadletter.e2e-spec.ts`), in `ddd/users-api/test/` with
  Testcontainers (pattern: `postgres-idempotency-store.e2e-spec.ts`):
  - `PostgresAuditSink` and `PostgresDeadLetterTransport`, against Postgres, using
    `createAuditTableSql()` and `createDeadLetterTableSql()`. Include arrays, nested objects
    and non-ASCII strings in payloads;
  - `RedisIdempotencyStore`, against Redis (`@testcontainers/redis` is already a
    dependency). Cover the claim, complete-if-owned and delete-if-owned scripts, including
    ownership loss;
    - also settle one inconsistency found by reading the code (not reproduced):
      `get()` runs `JSON.parse` unguarded, so a corrupt stored value throws. The
      complete-if-owned and delete-if-owned Lua scripts treat the same value as absent
      (`pcall(cjson.decode)` → `0`). Pick one behavior, document it and pin it with a test.
      Failing closed is probably right for `get`; the idempotency behavior's handling of a
      throwing store decides this.
  - `RabbitMqDeadLetterTransport` stays untested against a real broker: the owner decided
    not to add `amqplib` (see Decisions).

  Fix any defect in the package that the tests expose.
- [x] A7. **users-api session cookie can exceed 4,096 bytes (flaky e2e).** Found on
  2026-09-24: `test/permissions-in-token.e2e-spec.ts` ("keeps a maximum-size permissions
  token within one cookie…") failed once in a full `pnpm test:e2e` run with a 4,111-byte
  session `Set-Cookie`. It passed 3 times alone and in a full rerun.
  - Cause: `@fastify/secure-session` stores `base64(ciphertext);base64(nonce)`, and the
    `cookie` serializer URL-encodes it, so each `+` and `/` costs 3 bytes. The ciphertext
    is random, so the cookie length varies per login. A custom `encode` option does not
    help: `@fastify/cookie` 11 calls `stringifySetCookie` with the cookie object only, and
    the option is ignored (tested).
  - Measured with 20,000 simulated logins per budget, using the login session shape:
    - token 2,600 (the current `ACCESS_TOKEN_MAX_BYTES` default): 3,971 to 4,139 bytes,
      median 4,045, and 243 over 4,096 (1.2%);
    - token 2,550: median 3,983, maximum 4,071;
    - token 2,500: median 3,907, maximum 3,995.

    Browsers may drop a cookie over 4,096 bytes, so a user with a maximum-size token can
    lose the session at random on login.
  - Fix: lower the default to 2,500, and state in its JSDoc that the encoded cookie length
    varies by about 170 bytes between logins. Update the e2e test's pinned default.

  Verify: a unit spec checks 1,000 logins at the limit and fails at the old default; the
  cookie-budget e2e test and the full e2e suite pass. Done (see Modified Files).

#### B. Missing pieces in the published packages

- [x] B1. **Enforced coverage.** Add core's `vitest.config.ts` coverage thresholds
  (`perFile`, 100% on all four metrics, production `src/**/*.ts`, no exclusions, no ignore
  directives) to the ten packages without them. Close the gaps in the table above with
  behavior tests; remove a branch only after establishing that it is unreachable.
- [x] B2. **`engines`.** Add `"engines": { "node": ">=22.0.0" }` (the root requirement) to
  every package and to `ddd/core`. The phase 2 packages get it in U1/S1.
- [x] B3. **README links on npmjs.com.** Replace relative links outside the package with
  absolute `https://github.com/aristoteliss/nestjs-pipeline/blob/master/...` URLs. Drop the
  cache README's link to the internal architecture skill.
  Verify: `grep -nE "\]\(\.\./" packages/*/README.md` prints nothing.
- [x] B4. **`PostgresIdempotencyStore` class JSDoc.** It sits above the `assertLeaseTtl`
  comment, so the class has no doc comment. Move it onto the class.
- [x] B8. **pipeline-cache diagnostic names a function it does not export.** The
  missing-`key` bootstrap diagnostic in `packages/pipeline-cache/src/cache.behavior.ts`
  (around line 152) suggests `cacheKeyTemplate(...)`. `@nestjs-pipeline/cache` does not
  export that function; it lives in `ddd/core`. Point it only at
  `createPartitionedCacheKeyFactory(...)`, or at a function the package exports, and keep
  the diagnostic test in step.
- [x] B7. **Correlation README install command.** Add its required peers
  (`@nestjs-pipeline/core`, `@nestjs/common`) to both install lines, as the other READMEs do.
- [x] B9. **`FeatureDisabledFilter` belongs in `@nestjs-pipeline/feature-flags`.** users-api's
  `src/common/filters/feature-disabled.filter.ts` maps that package's own
  `FeatureDisabledError` to HTTP. The package ships no filter, although rate-limit, zod and
  idempotency each ship one for their own error.
  - Move the filter and its spec into the package (`src/filters/`, exported). Keep 403 and
    the response body (`statusCode`, `error`, `message`, `flag`).
  - Replace the JSDoc's "adjust the status to 404" advice with a supported option, for
    applications that hide gated features:
    `app.useGlobalFilters(new FeatureDisabledFilter({ status: 404 }))`.
  - users-api registers the package's filter in `src/bootstrap.ts` and
    `test/support/e2e-app.ts`, and deletes its copy.
  - README section; B5 notes it.

  Verify: the package spec at 100% coverage, including the 404 option; users-api tests and
  `pnpm test:e2e` pass. Done (see Modified Files).
- [x] B10. **`UnauthorizedActionFilter` belongs in `@nestjs-pipeline/casl`.** users-api's
  `src/common/filters/unauthorized-action.filter.ts` maps that package's own
  `UnauthorizedActionException` to 403.
  - Move the filter and its spec into the package (`src/filters/`, exported). Keep the
    response body (`statusCode`, `error`, `message`, `action`, `subject`).
  - users-api registers the package's filter in `src/bootstrap.ts` and
    `test/support/e2e-app.ts`, imports it in `test/cqrs-runtime-errors.spec.ts`, and deletes
    its copy.
  - README section; B5 notes it.

  Verify: the package spec at 100% coverage; users-api tests and `pnpm test:e2e` pass.
  Done (see Modified Files).
- [x] B11. **`createMapper` belongs in `@nestjs-pipeline/zod`, as `createZodMapper`.**
  users-api's `src/common/mappers/create-mapper.helper.ts` parses input with a Zod schema
  and returns `{ schema, map(input) }`. It is a controller-layer Zod adapter like `ZodPipe`,
  and nothing in it is specific to users-api.
  - Move it and its spec into the package as `createZodMapper`, named like
    `createZodRequest`.
  - On failure it throws Nest's `BadRequestException(error.flatten())`, exactly as
    `ZodPipe` does. Today it throws `BadRequestException(z.treeifyError(error))`, so a
    mapper failure answers `{ errors, properties }` while a `ZodPipe` failure answers
    `{ formErrors, fieldErrors }`. After the move both return the second body, which the
    e2e tests already assert for `ZodPipe` (owner delegated the choice, 2026-09-24). No
    test asserts the old body (checked 2026-09-24).
  - users-api's five mappers (`login`, `create-role`, `update-role`, `create-user`,
    `update-user`) import it from the package; delete the users-api helper.
  - README section; B5 notes it.

  Verify: the package spec at 100% coverage, asserting the `flatten()` body; users-api tests
  and `pnpm test:e2e` pass. Done (see Modified Files).

#### N. Independence from NestJS (`ddd/core`)

Each step keeps users-api's observable behavior. users-api gains only the Nest glue it
needs. Each step verifies:
- `ddd/core` specs no longer import `@nestjs/*`;
- users-api's existing composition and e2e suites pass unchanged.

- [x] N1. **`BaseCommand`.** Drop `implements ICommand`. `ICommand` is an empty marker
  interface, so commands remain structurally valid Nest commands.
- [x] N2. **`CommandBaseHandler`.**
  - Replace the `EventBus` constructor type with a framework-neutral event publisher port,
    `{ publishAll(events: IEvent[]): void }`, exported from `/application`. Nest's `EventBus`
    satisfies it structurally, so users-api subclasses keep injecting `EventBus` and passing
    it to `super`.
  - Drop `implements ICommandHandler`: Nest calls `execute()` structurally.
  - Event publication semantics are unchanged: publish then `uncommit`, only when events
    exist.
- [x] N3. **Logger port.**
  - Replace Nest's `Logger` in `Cache.ts`, `FromCache.ts` and `cache-owner.helper.ts` (and
    later `MikroOrmCache`, C4) with a minimal `{ warn(message: string): void }` port.
  - The default writes through `console.warn` with the current context prefix
    (`CacheDecorator`, `FromCacheDecorator`, `CacheDecorators`).
  - Each decorator takes its own optional `logger` option (`@Cache({ logger })`,
    `@FromCache({ logger })`), with no global configuration (owner decision). The
    once-per-class warning helper uses the logger of the decorator that triggered it.
    `MikroOrmCache` (C4) takes `logger` as a constructor option. users-api passes a Nest
    `Logger` adapter where it wants Nest-formatted output. The positional `@Cache(...)` and
    `@FromCache(...)` forms keep working with the default logger.
  - Every call is guarded so a throwing logger never changes a result (includes A5).
  - The once-per-class and once-per-adapter warning semantics stay as they are.
- [x] N4. **`uuidv7` in `cache-barrier.helper.ts`.** In phase 1, import `ddd/core`'s own
  existing `domain/utils/uuidv7` instead of `@nestjs-pipeline/core`; U2 later switches every
  caller to `@cqrs-ddd/uuidv7`. The output format and uniqueness guarantees are identical.
- [x] N5. **`filterCacheKey` and `cacheKeyTemplate`.** (Design changed by the owner on
  2026-09-24: an AsyncLocalStorage tenant scope instead of passing the tenant per call.)
  - The `IPipelineContext` type is replaced with structural types:
    `CacheKeyTenantSource = string | { tenantId?: string }` and
    `CacheKeyRequestContext { request; tenantId? }`. Pipeline contexts still satisfy them.
  - New `ddd/core/application/tenant-scope.ts`: `runWithTenant(tenantId, fn)` and
    `currentTenantId()` on Node's `AsyncLocalStorage`, exported from `/application`.
  - Tenant resolution, mirroring the old code with the scope in place of `pipelineStore`:
    - an explicit string always wins, and an empty one fails;
    - an object uses its `tenantId`, otherwise the scope;
    - with no tenant argument, `cacheKeyTemplate` uses a context source's `tenantId`,
      then the scope;
    - nothing resolved throws `MissingTenantContextError` (fail closed).
  - `stableStringify` comes from a module-private copy
    (`persistence/helpers/stable-stringify.ts`). The algorithm, error messages and `cause`
    are unchanged; only the always-true `sortKeys` switch is dropped and the helper is
    private, so no export exists only for a spec and no branch is dead. S2 later deletes the
    copy in favor of `@cqrs-ddd/safe-stringify`.
  - users-api: new `src/infrastructure/behaviors/tenant-scope.behavior.ts`, registered first
    in the global `'all'` behaviors, runs every pipeline execution inside
    `runWithTenant(context.tenantId, next)`. That is the same value, with the same coverage,
    that the old fallback read from `pipelineStore`, so the 16 repository call sites keep
    their two-argument form.
  - Survey of other tenant carriers (2026-09-24): no other change needed.
    - Packages read `context.tenantId` from the pipeline context they are given, which lives
      in core's `pipelineStore`.
    - users-api's current tenant is its `TenantSchemaContext` AsyncLocalStorage, read
      through the `ITenantContext` port. It is set by `TenantSchemaMiddleware` (HTTP) and by
      the two BullMQ processors (from `job.data.tenant`).
    - Explicit tenants remain only where the tenant is data: job payloads that cross the
      process boundary, JWT, session and API-client claims, and per-schema persistence
      internals.
  - Making `TenantSchemaContext` delegate to the new scope was rejected. Code outside a
    `run()`, such as e2e tests that call the bus directly, gets the default schema today and
    would throw instead.
  - `MissingTenantContextError`'s message and JSDoc no longer mention `PipelineModule` or
    `AGENTS.md`. They say: pass the tenant explicitly, or run inside `runWithTenant(...)`.
- [x] N6. **Enforce independence.** Done: `framework-independence.grit` (specs included),
  `ddd/core/package-manifest.spec.ts` and the extended entry-point spec (see Modified
  Files). No `ddd/core` spec constructed Nest classes after N2.
  - Add a Grit rule (or a boundary spec like core's `package-boundaries.spec.ts`) that
    fails on any `@nestjs/*` or `@nestjs-pipeline/*` import in the production code of
    `ddd/core`, `packages/uuidv7` and `packages/safe-stringify`.
  - Move `ddd/core` specs that construct Nest classes (`EventBus` etc.) to plain fakes; the
    Nest composition is proven in users-api.

#### C. `ddd/core` functionality currently implemented in users-api

These are generic DDD and persistence building blocks, not users-api choices: `ddd/core`'s
own docs and `AGENTS.md` already describe them as the standard mechanisms. Implement each
in `ddd/core` in framework-neutral, reusable form, then make users-api consume it.
- Keep users-api behavior identical.
- Carry the specs and full JSDoc across.
- No Nest decorators or imports (N6). Do N first, so the moved code lands Nest-free.

- [x] C1. **Persistence error translation.** `isTransientPersistenceError` and
  `mapPersistenceError` (users-api `src/persistence/is-transient-persistence-error.ts`)
  classify driver and network failures into `ddd/core`'s own `TransientOperationError`.
  `ddd/core` documents `mapPersistenceError` as the canonical
  `@MapPersistenceErrors({ otherwise })` translator. Put them in `ddd/core/persistence`.
  Done (see Modified Files), with one bug fix: a cyclic `cause` chain overflowed the stack.
- [x] C2. **Write-side base repository.** `MikroOrmWriteSideCommandRepository` (users-api
  `src/persistence/mikro-orm-write-side.command-repository.ts`) is the authoritative
  aggregate loading for mutations required by rule 18 in `AGENTS.md`: `{ refresh: true }`
  plus `mapPersistenceError`. Put it in `ddd/core/persistence`, and replace its
  `MikroOrmStore` dependency with a minimal store port (`{ readonly em: EntityManager }`).
  Done (see Modified Files).
- [x] C3. **Tenant context error and `requireTenantId`.** users-api's
  `MissingTenantContextError` (`src/common/cqrs/helpers/requireTenantId.helper.ts`) duplicates
  `ddd/core`'s class under the same name with a different base class. `ddd/core`'s class is
  the one. Do C3 together with A4, which maps it to 500: switching the class alone would
  turn today's 500 into 400.
  - Move `requireTenantId` into `ddd/core` `/application`, next to `runWithTenant` (owner
    delegated the placement, 2026-09-24). It accepts the same tenant source as the cache-key
    helpers (a tenant string, or `{ tenantId?: string }`), falls back to the
    `runWithTenant` scope, and throws `ddd/core`'s `MissingTenantContextError`. Inside a
    pipeline this matches today's behavior: `TenantScopeBehavior` sets the scope from the
    same `context.tenantId`.
  - `filterCacheKey` and `cacheKeyTemplate` use it instead of their private
    `resolveTenantSchema`. Their golden keys and fail-closed cases must pass unchanged.
  - Its only users-api caller, `src/common/cqrs/helpers/idempotent-operation.helper.ts`,
    imports it from `@nestjs-pipeline/ddd-core/application`. Delete the users-api helper and
    port its spec cases. Done with A4 (see Modified Files).
- [x] C4. **MikroORM cache adapter.** `MikroOrmCache` and `CacheEntry` (users-api
  `src/persistence/cache/`) are the MikroORM `IVersionedCache` implementation.
  `ddd/core/README.md` names `MikroOrmCache` as the second `IVersionedCache`
  implementation.
  - Put the adapter, the entity and its schema in `ddd/core/persistence` as a plain class:
    constructor `(store, options?)` behind the C2 store port, with the N3 logger port and no
    Nest DI decorators. users-api registers it with a `useFactory` provider.
  - Ship `createCacheTableSql(table?)`, exported, like `createAuditTableSql()` and
    `createDeadLetterTableSql()`, with a validated table name. Also export the entity schema
    to register. The SQL must match the columns `CacheEntry` maps and the users-api
    migration.
    Verify: a real-Postgres spec creates the table with the helper and runs
    `cache-adapter-conformance.spec.ts` against it.
  - Keep revision fencing, identity-map bypass and conditional expiry exactly as they are.
  - Move `cache-adapter-conformance.spec.ts` with it.
  - Part 1 done (see Modified Files). The store port is `ITransactionalEntityManagerSource`
    (C2's `IEntityManagerSource` plus `transactional(work)`): the adapter runs every write in
    a transaction on a manager dedicated to the call, which `em` alone cannot express.
  - Part 2 done (see Modified Files). A `ddd/core` spec cannot run against Postgres, so
    the real-backend check is a users-api e2e suite that mirrors the conformance and
    fencing cases; coverage came from targeted fencing specs rather than parametrizing
    `versioned-cache.contract.spec.ts`.
- [x] C5. **Root-entity schema mapping.** `rootEntityProperties()` and `versionProperty()`
  (users-api `src/persistence/schemas/root-entity.properties.ts`) map `RootEntity`'s
  identity, timestamp and version accessors for MikroORM. Put them in `ddd/core/persistence`
  with configurable column names. The defaults are the current `created_at`/`updated_at`
  names, so users-api's schemas stay unchanged.
- [x] C6. **Error-to-HTTP-status mapping, framework-neutral.**
  - `@cqrs-ddd/core` exports, from a new `/http` entry point, a pure function that maps its
    own errors to an HTTP status and label: 409 `ConcurrencyConflictError`, 404
    `EntityNotFoundException`, 500 `MissingTenantContextError`, 400 for any other
    `DomainException`. It returns plain numbers and strings, uses no framework types, and
    keeps HTTP out of `/domain` and `/application`.
  - users-api's Nest `DomainExceptionFilter` stays in users-api. It uses the function for
    `ddd/core` errors and keeps its own mappings (unique email/role name 409, validation 422,
    auth 401/500).
- [x] C7. **Dead branches found by coverage.**
  - `ddd/core/persistence/helpers/filter-cache-key.helper.ts:138`: its only caller already
    excludes `null`/`undefined`. Remove the branch.
  - `ddd/core/domain/events/root-domain.event.ts:120`: `if (desc)` is always true for an own
    key. Remove it, or cover it if Proxy input must be supported.
  - `ddd/core/persistence/command-repository.abstract.ts:43`: the constructor is never run
    by `ddd/core` specs. Cover it with a minimal subclass spec.
- [x] C8. **Docs after the moves.**
  - Update `ddd/core/README.md` (entry points, configuration, the cache adapter, the store
    port, the status mapping), `ddd/core/CLAUDE.md` (Ownership, Independence) and
    `ddd/users-api/CLAUDE.md`.
  - Update users-api `src/persistence/README.md` and `src/common/filters/README.md`.
  - Update the architecture skill's positive-example paths and the codebase map's Critical
    Modules.

#### Phase 1 coverage

- [x] D4. **`ddd/core` coverage.** After C7, enforce 100% like core (in its current folder).

#### Gate 1: everything correct in the current structure

- [x] G1. Before any folder move, new package or rename:
  - `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm check`,
    `pnpm lint:persistence`, `pnpm test`, `pnpm test:e2e` (Docker) and
    `pnpm test:release` all pass;
  - every package and `ddd/core` meets its enforced 100% coverage;
  - `ddd/core` has no `@nestjs/*` or `@nestjs-pipeline/*` import or dependency (N6);
  - users-api behaves as before. Record the results here.

  Results (2026-09-25, commit `5c94efee`, clean tree before and after):
  - exit 0: `pnpm install --frozen-lockfile --offline`, `pnpm build`, `pnpm lint`,
    `pnpm check`, `pnpm lint:persistence`, `pnpm test`, `pnpm test:e2e`,
    `pnpm test:release`;
  - `pnpm test`: core 331, `ddd/core` 620, audit 86, cache 93, casl 192, correlation 93,
    deadletter 58, feature-flags 56, idempotency 140, opentelemetry 67, rate-limit 52,
    resilience 56, zod 141, users-api 717; no coverage-threshold error;
  - `pnpm test:e2e`: 191 tests in 35 files; `pnpm test:release`: 12 packed packages,
    core lifecycle, CASL 7;
  - all 12 package configs and `ddd/core` have `perFile` and 100% on all four metrics; no
    `v8`/`c8`/`istanbul` ignore directive in `packages/*/src` or `ddd/core`;
  - `ddd/core`: no `dependencies`; `@mikro-orm/core` the only, optional, peer; every
    `@nestjs` import text in it is a template-string fixture in the two Biome plugin
    specs; `framework-independence.grit` and `domain-entry-point.spec.ts` pass;
  - users-api: unit and e2e suites pass unchanged in behavior.
  - Still open, not blocking: the `PostgresIdempotencyStore` `jsonb` question (Open
    Questions).

  Phase 2 starts only when everything here is green.

### Phase 2: rearrange into the target layout (only after Gate 1)

#### H. Shared-helper inventory (search done 2026-09-24)

Method:
- every name exported from `@nestjs-pipeline/core`'s `src/index.ts` that another workspace
  imports in production code;
- every function or constant name defined in more than one package's production source.

| Helper | Defined in | Used by (besides the owner) | Destination |
| --- | --- | --- | --- |
| `uuidv7`, `isUuidV7` | core `helpers/uuidv7.ts` and a duplicate in `ddd/core/domain/utils/uuidv7.ts` | correlation, `ddd/core` | `@cqrs-ddd/uuidv7` (U) |
| `stableStringify`, `toStrictJsonValue`, `StrictJsonValue` | core `helpers/stableStringify.ts` | cache, idempotency, `ddd/core`, users-api | `@cqrs-ddd/safe-stringify` (S) |
| `safeStringify`, `safeSanitize`, `redactValue`, `DEFAULT_REDACT_KEYS`, `REDACTED`, `SanitizeOptions` | core `helpers/safeStringify.ts` | audit, deadletter, users-api | `@cqrs-ddd/safe-stringify` (S) |
| `joinKeySegments`, `escapeKeySegment`, `ABSENT_SEGMENT` | core `helpers/key-segment.ts` (no imports) | cache, idempotency, rate-limit, users-api | `@cqrs-ddd/safe-stringify` (S): key text for identity, next to `stableStringify` |
| `\`/`:` escaping inside `cacheKeyTemplate` | `ddd/core/persistence/helpers/filter-cache-key.helper.ts:143` (a second copy of `escapeKeySegment`, same output) | `ddd/core` | replace with `escapeKeySegment` from `@cqrs-ddd/safe-stringify` (S2) |
| `toPostgresJson` | core `helpers/postgres-json.ts` | audit, deadletter | stays in core: Postgres `jsonb` text, not serialization; revisit with the idempotency question in Open Questions |
| `untyped` | core `types/safe-typing.ts` | correlation, idempotency, opentelemetry, zod | stays in core: a type-only cast for the Nest packages, and no `@cqrs-ddd` package needs it |
| `assertSafeTable`, `SAFE_IDENTIFIER` | audit, deadletter and idempotency Postgres adapters (three copies) | none | stays per package: Postgres-specific, with a package-specific error message; neither new package is about SQL |
| `inScope` | cache and idempotency behaviors | none | stays: two lines each, over different option types |
| `dyn` | correlation `types/safe-typing.ts` | none | stays in correlation |

Everything else found was test-only fixtures (`makeCtx`, `makeContext` and similar) or
overload signatures.

#### U. `@cqrs-ddd/uuidv7`: one shared UUIDv7 package

Today there are two identical implementations:
- `packages/pipeline/src/helpers/uuidv7.ts`, public in `@nestjs-pipeline/core` as `uuidv7`
  and `isUuidV7`;
- `ddd/core/domain/utils/uuidv7.ts`.

Their callers are core's `services/pipeline-runner.ts`, correlation (it re-exports core's
through `src/helpers/uuidv7.ts`), and `ddd/core`'s `domain/events/domain.event.ts`,
`domain/models/root.entity.ts` and `persistence/helpers/cache-barrier.helper.ts`.

- [x] U1. **Create `packages/uuidv7` as `@cqrs-ddd/uuidv7`.**
  - Zero runtime dependencies (Node `crypto` only), framework-neutral, and no `@nestjs/*`.
  - API exactly as today: `uuidv7(): string` and `isUuidV7(value: unknown): value is string`.
    Same algorithm and output (RFC 9562; not monotonic within one millisecond). Keep core's
    full JSDoc, including the bit layout.
  - Move both existing specs into it, merged without losing any case.
  - Scaffolding like the other packages:
    - `package.json` with `name`, version 0.2.0, `files`, `license`, `engines` `>=22.0.0`,
      `publishConfig` public, `repository` with `directory`, `prepublishOnly: pnpm run
      rebuild`, and no dependencies;
    - `tsconfig.json`/`tsconfig.build.json`;
    - `vitest.config.ts` with enforced 100% coverage;
    - `src/index.ts`, a README (purpose, install, API, format guarantees), and license headers;
    - a manifest spec like `ddd/core/package-manifest.spec.ts`.
      `framework-independence.grit` already covers `packages/uuidv7` (N6).
- [x] U2. **Use it everywhere.**
  - `@nestjs-pipeline/core`:
    - add `@cqrs-ddd/uuidv7` to `dependencies`. It is a zero-dependency pure utility with no
      identity, so a duplicate copy is harmless; a peer adds nothing;
    - keep `export { isUuidV7, uuidv7 }` in `src/index.ts` as a re-export;
    - delete `src/helpers/uuidv7.ts`;
    - update `package-boundaries.spec.ts`;
    - amend `packages/CLAUDE.md` ("core adds no runtime dependency beyond NestJS itself") to
      allow `@cqrs-ddd/uuidv7` and `@cqrs-ddd/safe-stringify` (S2) explicitly, as the only
      exceptions.
  - `@nestjs-pipeline/correlation`: re-export `uuidv7` from `@cqrs-ddd/uuidv7` (added to
    `dependencies`) instead of from core. The public export is unchanged.
  - `@cqrs-ddd/core`: import from `@cqrs-ddd/uuidv7` in the three files above, and delete
    `domain/utils/uuidv7.ts` and its spec (merged in U1).
  - users-api: import directly from `@cqrs-ddd/uuidv7` wherever it needs UUIDv7 itself.

  Verify:
  - `grep -rn "function uuidv7" packages ddd --include=*.ts` finds only
    `packages/uuidv7/src`;
  - core and correlation still export `uuidv7` (`pnpm test:release` consumer check);
  - `pnpm test` and `pnpm test:e2e` pass.
- [x] U3. **Tooling.** `copy-licenses`, `test:release` and `publish:all` pick it up under
  `packages/*`. Extend the release check to load it standalone with nothing else installed.

#### S. `@cqrs-ddd/safe-stringify`: one package for serialization and key text

Core has two serializers today, in `packages/pipeline/src/helpers/`. Both have no imports,
and core re-exports both modules with `export *`.

| | `stableStringify.ts` | `safeStringify.ts` |
| --- | --- | --- |
| Exports | `stableStringify`, `toStrictJsonValue`, `StrictJsonValue` | `safeStringify`, `safeSanitize`, `redactValue`, `DEFAULT_REDACT_KEYS`, `REDACTED`, `SanitizeOptions` |
| Purpose | identity: cache keys, idempotency fingerprints, stored snapshots | observability: logs, audit and dead-letter payloads |
| Output | deterministic JSON, keys sorted at every level, frozen forever | readable, insertion order, free to evolve |
| Unsupported input | throws (`undefined`, functions, `bigint`, symbols, cycles, sparse arrays, `Map`/`Set`, non-finite numbers) | never throws: cycles become `[Circular]`, errors are expanded |
| Secrets | no redaction (keys must not change) | redaction and exclusion |

Callers:
- strict: cache `helpers/cache-key.ts`; idempotency `helpers/fingerprint.ts` and
  `helpers/json-snapshot.ts`; `@cqrs-ddd/core` `persistence/helpers/filter-cache-key.helper.ts`;
  users-api `users/cqrs/queries/user-overview-cache.policy.ts` and
  `common/cqrs/helpers/idempotent-operation.helper.ts`. Cache and idempotency re-export
  `stableStringify` publicly.
- log-safe: core `behaviors/logging.behavior.ts`; audit `helpers/build-record.ts` and
  `helpers/redact.ts`; deadletter `helpers/build-record.ts`. Audit and deadletter
  re-export `redactValue`, `DEFAULT_REDACT_KEYS` and `REDACTED` publicly.

Key-segment helpers, core `helpers/key-segment.ts` (no imports):
- `joinKeySegments(segments)` escapes each segment and joins them with `:`, turning
  `undefined`/`null` into `ABSENT_SEGMENT` so tuples cannot collide;
- `escapeKeySegment` escapes `\` then `:`.

Core re-exports them publicly. Callers: cache, idempotency and rate-limit key builders,
and users-api. `ddd/core`'s `cacheKeyTemplate` has its own copy of the escaping.

- [x] S1. **Create `packages/safe-stringify` as `@cqrs-ddd/safe-stringify`** with the three
  modules (strict serializer, log-safe serializer, key segments) moved unchanged.
  - Same names, algorithms, error messages and `cause`s, redaction lists and matching rules.
  - Full JSDoc and specs move too.
  - Zero runtime dependencies, framework-neutral, no `@nestjs/*`.
  - One `src/index.ts` exports both families.
  - Share internals only where the two genuinely do the same thing (for example cycle
    tracking); never let a log-format change reach the strict path.
  - Add golden-output specs for `stableStringify` and `joinKeySegments` that pin exact
    strings for representative inputs:
    - nested and unsorted keys, arrays, dates, `toJSON`, unicode keys;
    - segments containing `:` and `\`, and `undefined`/`null` segments.

    Any change there would silently change cache keys, rate-limit buckets and idempotency
    fingerprints.
  - Scaffolding as in U1:
    - `package.json` with `files`, `license`, `engines`, `publishConfig`, `repository`,
      `prepublishOnly` and no dependencies;
    - tsconfigs;
    - enforced 100% coverage;
    - license headers;
    - a manifest spec like `ddd/core/package-manifest.spec.ts`.
      `framework-independence.grit` already covers `packages/safe-stringify` (N6).
  - The README states when to use which: strict for identity, safe for display. Never use
    `safeStringify` for keys.
- [x] S2. **Use it everywhere.**
  - Core:
    - add `@cqrs-ddd/safe-stringify` to `dependencies` (the same single-exception rule as
      U2);
    - replace both `export *` lines and the `key-segment` export with explicit re-exports
      of every name listed above, so core's public API is unchanged;
    - delete the three helpers;
    - `logging.behavior.ts` imports from the package;
    - update `package-boundaries.spec.ts`.
  - Cache, idempotency, rate-limit, audit and deadletter: import from
    `@cqrs-ddd/safe-stringify` (added to `dependencies`) and keep their current public
    re-exports. Audit's `helpers/redact.ts` re-exports from the package instead of core.
  - `@cqrs-ddd/core`:
    - import `stableStringify` from the package, and delete the temporary internal copy from
      N5 (the golden and parity specs must still pass);
    - replace the inline `\`/`:` escaping in `cacheKeyTemplate`
      (`filter-cache-key.helper.ts:143`) with `escapeKeySegment`. The output is the same;
      the golden spec and `test/cache-key-canonicalization.e2e-spec.ts` prove it.
  - users-api: import these helpers from `@cqrs-ddd/safe-stringify` instead of core.

  Verify:
  - `grep -rnE "function (stableStringify|toStrictJsonValue|safeStringify|safeSanitize|redactValue|joinKeySegments|escapeKeySegment)" packages ddd --include=*.ts`
    finds only `packages/safe-stringify/src`;
  - the public exports of core, cache, idempotency, audit and deadletter are unchanged
    (`pnpm test:release`);
  - `test/cache-key-canonicalization.e2e-spec.ts`, the idempotency fingerprint specs and the
    logging, audit and dead-letter redaction specs pass unchanged.
- [x] S3. **Tooling.** Covered by `packages/*` scripts. Extend the release check to load it
  standalone.

#### D. Restructure `ddd/core` as its own package

- [x] D1. **Move** `ddd/core` → `packages/ddd-core` (owner decision). Update:
  - `pnpm-workspace.yaml` if needed;
  - `biome.json` overrides and the Grit plugin paths that match `ddd/*`
    (`ddd-layering`, `ddd-entry-points`, `transport-neutral-errors`,
    `persistence-lifecycle`, `core-environment`, `aggregate-identity` and
    `framework-independence`);
  - tsconfig and vitest aliases, and the nested `CLAUDE.md` location;
  - the root `CLAUDE.md`, `AGENTS.md` and the architecture skill references to `ddd/core`;
  - `packages/CLAUDE.md`, which is scoped to `@nestjs-pipeline/*` and says packages depend on
    `@nestjs-pipeline/core`: add the three framework-neutral `@cqrs-ddd/*` packages
    (`ddd-core`, `uuidv7`, `safe-stringify`) as their own group, with no Nest dependency;
  - the codebase map;
  - `ddd/core/README.md`'s 13 relative links (`../../.agents/...`, `../users-api/...`): make
    them absolute GitHub URLs on the new `api/` paths, and drop the architecture-skill
    link, as B3 did for the packages. `pnpm test:release` rejects `](../` in a packed
    README once the package is published.

  `verify-package-licenses.grit` forbids published packages from importing
  `@nestjs-pipeline/ddd-*`. Change it to forbid `@nestjs-pipeline/*` packages from importing
  `@cqrs-ddd/core`, and allow `@cqrs-ddd/uuidv7` and `@cqrs-ddd/safe-stringify` (U2, S2).
  `@cqrs-ddd/core` may import itself in its specs. T3 adds the one exception,
  `packages/pipeline-tenant`.
- [x] D1a. **Move** `ddd/users-api` → `api/` (owner decision 2026-09-24). The app's contents
  sit directly in `api/` (`api/src`, `api/test`, `api/package.json`). Then delete the empty
  `ddd/` folder. Rename the package `@nestjs-pipeline/ddd-users-api` →
  `@nestjs-pipeline/ddd-api` (owner decision; still private). Update every
  `pnpm --filter @nestjs-pipeline/ddd-users-api` in root `package.json` scripts, `CLAUDE.md`
  files, READMEs and the codebase map. Also update:
  - `pnpm-workspace.yaml`: replace `ddd/*` with `api`;
  - `api/tsconfig.json` and any other config that reaches the repository root with
    `../../`: now one level up (`../`). The app's own internal relative imports move with it
    and do not change;
  - **`biome.json` plugin globs** (`**/ddd/*/src/**/cqrs/**`, `**/ddd/*/src/**/domain/**`,
    `.../application/**`, `.../persistence/**`, `.../events/**`, `**/ddd/core/**`). Without
    this, the architecture rules stop checking the app silently. Change them to `api/src/**`
    and `packages/ddd-core/**`;
  - the lint-rule specs that use paths (`biome-general-plugins.spec.ts`,
    `biome-persistence-plugin.spec.ts`, for example
    `ddd/users-api/src/roles/persistence/update-role.command-repository.ts`);
  - `.gitignore` (`ddd/users-api/src/persistence/*.db`, `*.db-*`, `migrations/.snapshot*`)
    → `api/src/persistence/...`;
  - `.vscode/launch.json` (`cwd`, `TSX_TSCONFIG_PATH`, `outFiles`);
  - `integration/packages/release.mjs:124-125`, which filters dependencies by `ddd/` and
    `ddd-core`. Update it for the new paths and the `@cqrs-ddd/*` names (D1b), and allow the
    two utility packages (U, S);
  - `packages/pipeline/src/package-boundaries.spec.ts` (`DDD_PREFIX`, and the comment about
    `ddd/*` workspaces);
  - `biome/plugins/event-handler-substance.grit` comment, and `biome/plugins/README.md`;
  - docs: root `README.md` (layout tree), `CLAUDE.md` (the nested `CLAUDE.md` list),
    `AGENTS.md`, `.claude/README.md`, the architecture skill (positive-example paths),
    `packages/CLAUDE.md`, `packages/pipeline/CLAUDE.md`,
    `packages/pipeline-opentelemetry/PRODUCTION.md`, the moved `CLAUDE.md`/README files,
    `api/src/persistence/README.md`, and the codebase map.

  Verify:
  - `grep -rn "ddd/users-api\|ddd/core\|ddd/\*" --exclude-dir=node_modules --exclude-dir=dist .`
    prints nothing outside `pnpm-lock.yaml`, which `pnpm install` rewrites;
  - `pnpm install`, `pnpm build`, `pnpm lint` and `pnpm test` pass;
  - `pnpm lint:persistence` is clean, and a probe violation placed in `api/src/**/cqrs/`
    is reported (then removed), proving the globs match;
  - `pnpm test:e2e` passes;
  - `pnpm context:update` then `pnpm context:validate` pass.
- [x] D1b. **Rename** `@nestjs-pipeline/ddd-core` → `@cqrs-ddd/core` (owner decision).
  - `package.json` `name`, and the `exports` subpaths unchanged (`@cqrs-ddd/core/domain`,
    `/application`, `/persistence`);
  - every import: 117 `.ts` files at baseline, mostly `ddd/users-api/src` and `test`;
  - `ddd/users-api/package.json` dependency;
  - the Grit rules that match the old name (`ddd-entry-points.grit`, `ddd-layering.grit`,
    `persistence-lifecycle.grit`, `verify-package-licenses.grit`) and `biome/plugins/README.md`;
  - `AGENTS.md`, the architecture skill, `CLAUDE.md` files, READMEs and the codebase map.

  Verify:
  - `grep -rn "@nestjs-pipeline/ddd-core" --include=*.ts --include=*.json --include=*.grit
    --include=*.md .` (excluding `node_modules` and `dist`) prints nothing;
  - `pnpm install`, `pnpm lint` and `pnpm test` pass;
  - `biome/*-plugin.spec.ts` still prove each rule fires, and `pnpm lint:persistence` is
    clean.
- [x] D2. **Scripts.** `copy-licenses`, `test:release` (`integration/packages/release.mjs`)
  and `publish:all` then cover it automatically. Extend the release check to load
  `/domain`, `/application` and `/persistence` in a consumer with **no `@nestjs/*`
  installed**: `/domain` and `/application` without MikroORM, `/persistence` with it.
- [x] D3. **`package.json` metadata.**
  - Remove `"private": true`.
  - Name `@cqrs-ddd/core` (D1b).
  - Peers: `@mikro-orm/core` only (optional).
  - Add `publishConfig` (`access: public`), `repository` (with `directory`), `homepage`,
    `bugs`, `keywords` and `engines`.
  - Set version 0.2.0.
  - Add `"prepublishOnly": "pnpm run rebuild"`, as every other package has, so a publish
    never ships a stale `dist`.
  - Add the `./http` export for C6.
  - Rewrite the description as a framework-neutral DDD library; it currently says "for the
    sample applications".
- [ ] D5. **README as consumer manual.** Cover:
  - install;
  - the three entry points and what each needs at runtime;
  - the per-decorator `logger` option;
  - the tenant order for cache keys: an explicit argument, then a context's `tenantId`,
    then the `runWithTenant` scope, then `MissingTenantContextError`. Name
    `@nestjs-pipeline/tenant` (T) as the bridge for NestJS pipeline applications;
  - use from NestJS: structural compatibility with `EventBus`, commands and handlers, plus
    the glue an application writes, with users-api as the example;
  - the lifecycle decorator order;
  - cache adapter requirements (`IVersionedCache`);
  - the `AggregateRoot.commit()` caveat: `publish` is a no-op until a publisher is
    connected;
  - known limits.

  No repo-internal links.

#### T. `@nestjs-pipeline/tenant`: `TenantScopeBehavior` as its own package

Owner decision (2026-09-24). `TenantScopeBehavior` is the bridge a NestJS pipeline
application needs so that `@cqrs-ddd/core`'s tenant scope follows the pipeline context: it
runs each pipeline invocation inside `runWithTenant(context.tenantId, next)`. It cannot live
in `@cqrs-ddd/core`, which has no Nest dependency, and nothing in it is specific to
users-api. It is the only `@nestjs-pipeline/*` package allowed to depend on
`@cqrs-ddd/core`.

Do it after D3. The release check installs every required peer, and it cannot install
`@cqrs-ddd/core` while that package is private and unpublished.

- [x] T1. **Create** `packages/pipeline-tenant` as `@nestjs-pipeline/tenant`, version 0.2.0.
  - Move `api/src/infrastructure/behaviors/tenant-scope.behavior.ts` and its spec, keeping
    the code and the JSDoc. Only the `ddd-core` wording changes to `@cqrs-ddd/core`.
  - `src/index.ts` exports `TenantScopeBehavior` only: no module, no intent helper and no
    stable behavior id.
  - Peers: `@nestjs-pipeline/core` and `@cqrs-ddd/core` (both `workspace:^`),
    `@nestjs/common` and `reflect-metadata`, with the ranges the other packages use. The
    matching devDependencies use `workspace:*`. `@cqrs-ddd/core` must be a peer, never a
    `dependency`: its tenant scope is a module-level AsyncLocalStorage, so with a second
    copy the behavior would set one scope while `filterCacheKey` reads the other and fails
    closed.
  - Manifest fields as in the other packages: `description`, `keywords`, `license`,
    `repository` (with `directory`), `homepage`, `bugs`, `main`, `types`, `files`,
    `publishConfig`, `engines` (`node >=22.0.0`) and the scripts, including
    `"prepublishOnly": "pnpm run rebuild"`.
  - `tsconfig.json`, `tsconfig.build.json` and `vitest.config.ts` as in the other packages,
    with enforced 100% coverage (B1).
  - The license header on every source file.
  - README (absolute links only, B3):
    - the install line with every required peer;
    - registration first in the global `'all'` `before` list;
    - the tenant order it enables: an explicit argument, then a context's `tenantId`, then
      the scope, then `MissingTenantContextError`;
    - a pipeline invocation without a tenant runs with none, so tenant-scoped keys fail
      closed.

  Verify: `pnpm --filter @nestjs-pipeline/tenant test` passes at 100% coverage, and its
  `build` emits `dist/index.js` and `dist/index.d.ts`.
- [x] T2. **Adopt it in users-api.** Add the `workspace:*` dependency.
  `src/infrastructure/observability.module.ts` imports `TenantScopeBehavior` from
  `@nestjs-pipeline/tenant` and keeps it first in the global `'all'` `before` list.
  Delete the users-api copy and its spec.
  Verify: the users-api tests pass with the same count minus the moved spec, and
  `pnpm test:e2e` passes with the same count.
- [x] T3. **Boundaries, docs and release.**
  - [x] Done in T1, which could not pass `pnpm check` or `pnpm test:release` without them:
    the `verify-package-licenses.grit` exception with its plugin spec cases, the
    `release.mjs` peer exception, and the `packages/CLAUDE.md` note.
  - `verify-package-licenses.grit`, as changed in D1: allow `@cqrs-ddd/core` imports in
    `packages/pipeline-tenant` only. Add a plugin spec case proving the rule still fires in
    another `@nestjs-pipeline/*` package.
  - `packages/pipeline/src/package-boundaries.spec.ts`: only `@nestjs-pipeline/tenant` may
    declare `@cqrs-ddd/core`, and only as a `workspace:^` peer.
  - `packages/CLAUDE.md`: name the exception and its reason.
  - Root `README.md`: add the package to the "Packages" and "Current Package Versions"
    tables.
  - `integration/packages/release.mjs` discovers `packages/*` by itself. Confirm that it
    packs the package, loads it in the consumer, and accepts its `@cqrs-ddd/core` peer.

  Verify: `pnpm check`, `pnpm lint:persistence`, `pnpm test` and `pnpm test:release` pass.

#### Gate 2: everything correct after the rearrangement

- [ ] G2. Rerun every G1 check on the new layout and names, plus the D1a lint probe. All
  must pass with the same results as G1 (same test counts, apart from specs added in phase 2).

### Phase 3: prepare the publish

#### Release notes

- [ ] B5. **Release notes.** There is no `CHANGELOG.md`. Record the 0.2.0 changes for the
  packages already on npm (core 0.1.18, correlation 0.1.8, opentelemetry 0.1.8, zod 0.1.6,
  casl 0.1.1):
  - core: the tenant id is write-once per context. An unowned instance of a handler class
    shared by several applications throws. Default redaction is broader and case-, `_`- and
    `-`-insensitive. `excludeKeys` also applies to cloned `Error` properties and `Map` keys.
  - correlation: incoming IDs default to a maximum length of 128 and
    `DEFAULT_CORRELATION_ID_PATTERN`.
  - casl: object placeholder values throw. New export `UnauthorizedActionFilter` (B10).
  - zod: new export `createZodMapper` (B11).
  - opentelemetry: a throwing tracer never replaces the handler's outcome.

  Confirm each against the published typings. For each first-release package, state its
  notable defaults once (feature-flags: `FeatureDisabledFilter` answers 403, B9). Add a
  separate entry for `ddd/core` listing the section N API
  changes, and first-release entries for `@cqrs-ddd/uuidv7`, `@cqrs-ddd/safe-stringify` and
  `@nestjs-pipeline/tenant`.
  Note, as same API and output, that:
  - `uuidv7`/`isUuidV7` now come from `@cqrs-ddd/uuidv7` (core, correlation);
  - `stableStringify`/`toStrictJsonValue` (core, cache, idempotency), the key-segment
    helpers (core) and the redaction helpers (core, audit, deadletter) now come from
    `@cqrs-ddd/safe-stringify`.

#### E. Pre-publish verification (last step before the owner publishes)

- [ ] E1. Run the full suite on the release commit: `pnpm install --frozen-lockfile`,
  `pnpm build`, `pnpm lint`, `pnpm check`, `pnpm lint:persistence`, `pnpm test`,
  `pnpm test:e2e` (Docker) and `pnpm test:release`. Record the results here.
- [ ] E2. Independence proof for `@cqrs-ddd/core`, `@cqrs-ddd/uuidv7` and
  `@cqrs-ddd/safe-stringify`:
  - `grep` finds no `@nestjs` string in their packed `dist/**/*.js` or `package.json`;
  - the D2, U3 and S3 consumer checks load every entry point (`@cqrs-ddd/core`'s
    `/domain`, `/application`, `/persistence` and `/http`) with no Nest installed.
- [ ] E3. Dry run: `pnpm copy-licenses && pnpm -r publish --access public --dry-run`. It
  must list exactly 16 packages (the 12 existing `@nestjs-pipeline/*` packages,
  `@nestjs-pipeline/tenant`, `@cqrs-ddd/core`, `@cqrs-ddd/uuidv7` and
  `@cqrs-ddd/safe-stringify`, all at 0.2.0) and no private workspace.
  Publish order: `@cqrs-ddd/uuidv7` and `@cqrs-ddd/safe-stringify` before the packages that
  depend on them (`pnpm -r` orders by dependency). The dry run must also list
  `@nestjs-pipeline/tenant` after `@cqrs-ddd/core` and `@nestjs-pipeline/core`.
- [ ] E4. Hand over to the owner: the branch and commit to publish from, the `CHANGELOG.md`
  entry and the dry-run output. The owner merges to `master` and publishes.

## Decisions

- Phasing (owner, 2026-09-24): phase 1 is bug fixes, then migrating functionality into
  `ddd/core` and making it Nest-independent, all in the current folders. Phase 2 does no
  folder moves, new packages or renames until Gate 1 shows everything correct with all tests
  at 100%. The phase 1 temporary `stableStringify` copy in `ddd/core` exists only to keep
  independence without restructuring, and S2 removes it.
- Independence (owner, 2026-09-24): `ddd/core` must not depend on NestJS or on any
  `@nestjs-pipeline/*` package, and it is published as its own npm package.
- `@cqrs-ddd/uuidv7` (owner, 2026-09-24): one shared UUIDv7 package that every package
  uses. It is a regular `dependency`, not a peer, because it is a zero-dependency pure
  utility. Core's "no runtime dependency beyond NestJS" rule gains this single exception.
- `@cqrs-ddd/safe-stringify` (owner named it and asked for both serializers in it,
  2026-09-24). It is a regular `dependency` for the same reason as uuidv7.
  - It keeps **two functions, not one**. `stableStringify` is an identity contract: it must
    throw on unsupported input, so two different inputs can never collapse into the same
    cache key or fingerprint, and its output must never change. `safeStringify` is a display
    contract: it must never throw inside a request and must redact secrets, and its output
    may evolve.
  - One function with a mode flag would still be two functions. A log-format change could
    then leak into keys. The package unifies them; the two exports stay distinct.
  - The `stableStringify` output is frozen by a golden spec.
- npm name (owner, 2026-09-24): `@cqrs-ddd/core`. Unpublished on the registry as of
  2026-09-24 (`npm view` returns E404). `cqrs-ddd` is the owner's npm organization.
- Layout (owner, 2026-09-24): users-api moves to `api/` (contents directly in `api/`) and
  is renamed `@nestjs-pipeline/ddd-api`. The `ddd/` folder is removed.
- Location (owner confirmed 2026-09-23): `packages/ddd-core`, not `ddd/core`. Everything
  published lives in `packages/`; `ddd/` keeps only the example app. The framework-neutral
  `@cqrs-ddd/*` packages (`ddd-core`, `uuidv7`, `safe-stringify`) sit next to the Nest
  packages, and the Nest packages may depend only on the two utilities, except
  `@nestjs-pipeline/tenant` (see below).
- Ownership (owner, 2026-09-24): the section C functionality belongs to `ddd/core`, not
  users-api. users-api configures and extends it. The Nest `DomainExceptionFilter` itself stays
  in users-api; only the framework-neutral status mapping moves (C6).
- Missing tenant context maps to HTTP 500 (owner delegated the choice 2026-09-23). It is
  never the client's fault: the tenant middleware already rejects bad headers, and every
  other path must be configured with a tenant. Keep `ddd/core`'s class and its
  `DomainException` base.
- Configuration (owner, 2026-09-24): separate options, with no global configuration
  function.
  - A logger is passed per decorator (`@Cache`/`@FromCache` option) and per adapter
    (`MikroOrmCache` constructor option); the default is `console.warn`.
  - The tenant for cache keys (owner, 2026-09-24, replacing per-call passing): an explicit
    argument, or `ddd/core`'s own AsyncLocalStorage tenant scope (`runWithTenant`). This is
    not global configuration: the scope is set per unit of work at the application
    boundary. In users-api that is `TenantScopeBehavior`, which T moves into
    `@nestjs-pipeline/tenant`.
- `@nestjs-pipeline/tenant` (owner, 2026-09-24): a package that holds `TenantScopeBehavior`
  only. The HTTP exception filter stays in users-api, as C6 says. It is the only
  `@nestjs-pipeline/*` package that depends on `@cqrs-ddd/core`, as a peer, so that one
  copy of the tenant scope exists. Nothing under `@cqrs-ddd/*` depends on NestJS.
- users-api shared-code review (owner delegated the placement, 2026-09-24). Each file was
  read before deciding.
  - Moves: `FeatureDisabledFilter` → `@nestjs-pipeline/feature-flags` (B9),
    `UnauthorizedActionFilter` → `@nestjs-pipeline/casl` (B10), `createMapper` →
    `@nestjs-pipeline/zod` as `createZodMapper` (B11), `requireTenantId` → `ddd/core`
    `/application` (C3). `domain-exception.filter.ts` splits as C6 says.
  - Stays in users-api:
    - `src/common/context/tenant-context.port.ts`: users-api's own per-schema tenant, kept
      separate from `ddd/core`'s scope by the N5 survey;
    - `src/common/environment/load-optional-env-file.ts` and `auth-token.config.ts`:
      bootstrap and environment configuration; packages may not read `process.env`;
    - `src/common/validation/idempotency-key.schema.ts`: two lines, and moving the Zod
      schema would add a Zod dependency to the idempotency package;
    - `src/infrastructure/behaviors/telemetry-bridge.behavior.ts`: its JSDoc explains that
      only the application knows which add-ons are installed;
    - the rest of `src/common` (session store, guard, interceptor, constants, audit
      options, `email.schema.ts`, `read-freshness.helper.ts`,
      `idempotent-operation.helper.ts`) is users-api policy.
  - Later, not this release: the multi-tenant MikroORM setup (`tenant-schema.context.ts`,
    `tenant-entity-manager.resolver.ts`, `entity-manager-tenant.registry.ts`, the stores)
    could become its own package. It is large, and tied to Nest and to environment
    configuration.
- Cache keys, rate-limit buckets and idempotency fingerprints must stay byte-identical
  across the S move. The code moves unchanged, and the S1 golden specs freeze the output.
- Keep all existing public exports. Local non-use does not justify removal.
- Publish `ddd/core` as experimental 0.x.
- Dead-letter transports (owner, 2026-09-24): there is no new Redis pub/sub transport.
  BullMQ already runs on Redis and stays users-api's default dead-letter transport
  (`src/infrastructure/reliability.module.ts`, unchanged). RabbitMQ stays a package demo
  adapter with mocked tests only.
- No `amqplib` dependency (owner, 2026-09-23). The RabbitMQ dead-letter transport keeps its
  mocked unit tests only. Name this limitation in its README and in the release notes.
- Closed earlier, do not reopen: keep `setCorrelationFallback`; keep the production functions
  exported for specs; no core behavior-module factory.

## Modified Files

- A1: `ddd/core/package.json` (`files`). Verified: `pnpm pack` lists `dist/**` (184 files,
  no specs), `README.md`, `LICENSE` and `package.json`. `COMMERCIAL_LICENSE.txt` is absent
  until `copy-licenses` covers the package (D2). `ddd/core` tests pass and Biome is clean.
- A3: `ddd/core/domain/decorators/Mutable.ts` rejects a function target (static property);
  the spec is `ApplyMutation.spec.ts` ("rejects a static property without registering fields
  on Function"). Verified: the test failed before the fix ("expected function to throw") and
  passes after. `ddd/core` has 407 tests passing, and lint and Biome are clean. users-api
  passes 761 tests in 108 files.
- N1: `ddd/core/application/base.command.ts` no longer imports or implements `@nestjs/cqrs`
  `ICommand`. It is an empty interface (`export interface ICommand {}` in the installed
  package), so commands remain valid Nest commands structurally. Verified: `ddd/core` lint,
  Biome and tests (407) pass. The rebuilt `dist` `base.command.d.ts` has no `@nestjs/cqrs`.
  users-api typechecks against the rebuilt `dist` and passes its tests (761).
- N2: new `ddd/core/application/domain-event-publisher.port.ts` (`IDomainEventPublisher`,
  exported from `/application`). `CommandBaseHandler` takes it instead of Nest's `EventBus`,
  no longer implements `ICommandHandler`, and has `TCommand = unknown` with
  `execute(command: TCommand)` (the cast is gone). JSDoc explains Nest use.
  `command-base.handler.spec.ts` no longer imports `@nestjs/cqrs`. Verified:
  - `ddd/core` lint and Biome are clean and its tests pass (407); the rebuilt `dist` handler
    has no `nestjs` reference;
  - users-api typechecks against it, with Nest's `EventBus` accepted in every handler, and
    passes 761 tests in 108 files;
  - `pnpm test:e2e` passes 165 tests in 31 files.
- N3 + A5:
  - New public `ICacheLogger` (`ddd/core/persistence/cache-logger.ts`, exported from
    `/persistence`).
  - New internal `helpers/cache-logger.helper.ts`: `consoleCacheLogger(context)` is the
    default, writing `console.warn` with a `[context]` prefix, and `safeWarn` guards every
    call.
  - `@Cache` and `@FromCache` gain a `logger` option; the missing-`cache` helper takes an
    optional logger and keeps its `[CacheDecorators]` default. No `@nestjs/common` import
    remains in these files.
  - Specs spy on `console.warn` instead of Nest's `Logger`, assert the default prefixes, and
    add 4 cases: configured logger for `@Cache` and `@FromCache`, and throwing logger for
    both.
  - users-api keeps its logging: new `src/persistence/cache/cache-loggers.ts` (Nest
    `Logger`s `CacheDecorator` and `FromCacheDecorator`, routed to Pino) is passed at all
    10 cache decorator call sites. One nuance: the missing-`cache` warning, which never
    fires in users-api, would now carry the decorator's context instead of
    `CacheDecorators`.
  - A5 was **reproduced** on the old code: a failing `setKey` plus a throwing Nest
    `Logger.warn` made `save()` reject with "logger down" after the write succeeded. The new
    "resolves a durable write when the configured logger throws" case pins the fix.
  - Verified:
    - `ddd/core`: 411 tests pass, and lint and Biome are clean;
    - users-api typechecks against the rebuilt `dist` and passes 761 tests;
    - `pnpm test:e2e`: 165 tests pass;
    - `pnpm lint:persistence` is clean.
  - Remaining Nest coupling in `ddd/core`: `cache-barrier.helper.ts` (`uuidv7`) and
    `filter-cache-key.helper.ts` (N4, N5).
- N5:
  - `ddd/core`:
    - production changes: `application/tenant-scope.ts` (new, exported from
      `/application`), `persistence/helpers/stable-stringify.ts` (new, module-private),
      `persistence/helpers/filter-cache-key.helper.ts` and
      `domain/exceptions/missing-tenant-context.exception.ts`;
    - specs: `application/tenant-scope.spec.ts`, `persistence/helpers/stable-stringify.spec.ts`
      (core's cases plus golden strings) and `filter-cache-key.helper.spec.ts` (scope cases
      plus 15 frozen keys);
    - docs: `README.md` (new "Tenant-scoped cache keys" section) and `CLAUDE.md`.
  - users-api:
    - `src/infrastructure/behaviors/tenant-scope.behavior.ts` (+ spec), registered in
      `observability.module.ts`;
    - 9 repository specs use `runWithTenant` instead of a hand-made `pipelineStore.run`;
      2 freshness specs (`test/`) wrap their simulated pipeline in `runWithTenant`;
    - `src/common/cqrs/helpers/filterCacheKey.helper.spec.ts` replaces the ambient-fallback
      case with scope cases, including one proving `pipelineStore` alone is not read;
    - docs: `README.md` and `src/common/cqrs/helpers/README.md`.
  - Verified:
    - the golden keys were captured from the old build first (`filterCacheKey`,
      `cacheKeyTemplate` and `stableStringify`), and all match after the change;
    - a 20,000-value differential run of core's `stableStringify` against the copy was
      identical, including 7,271 error cases with the same message and `cause`;
    - `ddd/core`: 471 tests pass; the new files are 100% covered, and the only uncovered
      line is the C7 dead branch;
    - users-api: 765 tests in 109 files pass;
    - `pnpm test:e2e`: 165 tests in 31 files pass;
    - `pnpm lint`, `pnpm check`, `pnpm lint:persistence` and `pnpm context:validate` pass.
  - No `@nestjs/*` or `@nestjs-pipeline/*` import remains in `ddd/core` production code;
    specs still have some (N6).
- N4: `ddd/core/persistence/helpers/cache-barrier.helper.ts` imports `uuidv7` from
  `ddd/core`'s own `domain/utils/uuidv7`. Its code is identical to core's, comments aside
  (normalized diff). Verified:
  - `ddd/core`: 411 tests pass, lint and Biome are clean, and the built helper has no
    `@nestjs-pipeline` reference;
  - users-api typechecks and passes 761 tests;
  - `pnpm test:e2e`: 165 tests pass.

- N6 + A2:
  - New `biome/plugins/framework-independence.grit`, registered in `biome.json` for
    `ddd/core/**` (specs included) and the planned `packages/uuidv7/**` and
    `packages/safe-stringify/**`. It rejects `@nestjs/*`, other `nestjs`-named packages and
    `@nestjs-pipeline/*` in every import form: `import type`, re-exports,
    `import x = require()`, module augmentation, dynamic `import()` and `require()`.
    `persistence/biome-general-plugins.spec.ts` has 15 new cases for it.
  - New `ddd/core/package-manifest.spec.ts`, because Grit cannot read JSON: no NestJS
    package in any dependency field, and `@mikro-orm/core` is the only, optional, peer.
    `tsconfig.json` now type-checks root-level specs.
  - `domain/domain-entry-point.spec.ts` loads all four built entry points, not only
    `/domain`, and fails if any `@nestjs` module loads.
  - `persistence/helpers/cache-barrier.helper.spec.ts`, the only real import left, takes
    `isUuidV7` from `ddd/core`'s own `domain/utils/uuidv7`, which is identical to core's.
  - A2: `ddd/core/package.json` has no `dependencies`. `pnpm install` removed the four
    entries from `pnpm-lock.yaml`, and `ddd/core/node_modules` links no Nest package.
  - Docs: `ddd/core/README.md` (framework-neutral description, a "Dependencies" section
    that says when MikroORM loads, and publisher wording in the handler section),
    `ddd/core/CLAUDE.md`, `biome/plugins/README.md` (stale test counts dropped) and the
    codebase map (Architecture, Conventions).
  - Verified:
    - `ddd/core`: rebuilt; 494 tests in 30 files pass; lint is clean; the built `dist` has
      no `@nestjs` require or import, only comments;
    - users-api: lint is clean; 765 tests in 109 files pass;
    - `pnpm check`, `pnpm lint`, `pnpm lint:persistence` and `pnpm context:validate` pass;
    - `pnpm test:e2e`: 165 tests in 31 files pass. An earlier run had one failure, the
      pre-existing cookie-budget flake recorded as A7.

- A7 (users-api):
  - `src/common/environment/auth-token.config.ts`: the `ACCESS_TOKEN_MAX_BYTES` default is
    2500 instead of 2600. The JSDoc explains the URL-encoding variance and names both tests.
  - New `src/http-platform.spec.ts`: registers the real secure session through
    `registerSecureSession`, saves 1,000 login sessions with a maximum-size token through
    `SessionService`, and requires every session `Set-Cookie` to stay within 4,096 bytes.
    **Reproduced** at the old default: "expected 4111 to be less than or equal to 4096".
  - The pinned default in `auth-token.config.spec.ts` and
    `test/permissions-in-token.e2e-spec.ts`. `README.md`: the default in two places, and the
    cookie-size explanation, which claimed that a 2600-byte token always fits.
  - `.env*` files were not read. If `.env.example` sets `ACCESS_TOKEN_MAX_BYTES`, it may
    still say 2600.
  - Verified:
    - the new spec passes 6 runs in a row at 2500 (6,000 logins), in about 0.3 seconds each;
    - users-api: lint is clean; 766 tests in 110 files pass;
    - the cookie-budget e2e spec passes 3 runs in a row, and `pnpm test:e2e` passes 165
      tests in 31 files;
    - `pnpm check` passes.

- C1:
  - Moved with `git mv`: users-api `src/persistence/is-transient-persistence-error.ts` and
    its spec → `ddd/core/persistence/`, exported from `/persistence` (and the root barrel).
    The users-api re-export of `TransientOperationError` was dropped: `/domain` exports it.
  - **Bug fixed** (reproduced on the old code first): the classifier followed `cause`
    recursively, so a cyclic chain threw `RangeError: Maximum call stack size exceeded`,
    and inside a repository `catch` that replaced the original error. It now walks the
    chain iteratively and stops at a repeated object. Results for acyclic chains are
    unchanged.
  - Spec: every original case kept. The three Nest HTTP exceptions became `ddd/core`
    domain errors (N6), which are what reaches `otherwise`. Added: non-object inputs,
    every listed code, the `08` and `53` classes, both error names, a non-string code, a
    deep chain, the cycle regression and the message. The module is 100% covered.
  - users-api: the two delete repositories, `MikroOrmWriteSideCommandRepository` and
    `AuthSessionsRepository` import `mapPersistenceError` from
    `@nestjs-pipeline/ddd-core/persistence`; the write-side spec takes
    `TransientOperationError` from `/domain`.
  - Docs: full JSDoc with the classification rules and an example; `ddd/core/README.md`
    (two API entries); the `@MapPersistenceErrors` JSDoc links the translator;
    `ddd/core/CLAUDE.md` (Ownership, Important files); `ddd/users-api/CLAUDE.md` (no
    longer listed as living there); the architecture skill's anti-pattern example.
  - Verified:
    - `ddd/core`: rebuilt; 528 tests in 31 files pass; lint is clean;
    - users-api: lint is clean; 756 tests in 109 files pass (the 10 moved tests left);
    - `pnpm check` and `pnpm lint:persistence` pass;
    - `pnpm test:e2e`: 165 tests in 31 files pass.

- C2:
  - Moved with `git mv`: users-api `src/persistence/mikro-orm-write-side.command-repository.ts`
    and its spec → `ddd/core/persistence/`, exported from `/persistence`.
  - New exported port `IEntityManagerSource { readonly em: EntityManager }` replaces the
    `MikroOrmStore` type. Its JSDoc states that `em` is read on every operation, so a
    multi-tenant store can return the current tenant's manager. users-api's `MikroOrmStore`
    satisfies it unchanged, and the five subclasses still pass it to `super(...)`.
  - The class JSDoc example called `super(cache, store, User, 'User')` without the
    required hydrator; it now passes `User.aggregateName` and `User.fromJSON`, and uses
    generic names instead of users-api's.
  - Spec: a `ddd/core` test aggregate replaces users-api's `User`, and the store is typed
    instead of `as never`. The 3 original cases are kept (the first now also checks
    `name` and the stored `version`; the transient case checks message and `cause`).
    Added: a non-transient error is rethrown unchanged, and `em` is read on each call.
    The module is 100% covered.
  - users-api: `UpdateUser`, `DeleteUser`, `UpdateRole`, `DeleteRole` and `UpdateAuth`
    command repositories import the class from `@nestjs-pipeline/ddd-core/persistence`.
  - Docs: `ddd/core/README.md` (new entry), `ddd/core/CLAUDE.md` (Ownership, Important
    files), `ddd/users-api/CLAUDE.md` (list and Important files),
    `ddd/users-api/src/persistence/README.md` (import, port, and the generic order, which
    was `<TEntity, TSnapshot, TResult>` instead of `<TSnapshot, TEntity, TResult>`), and
    the codebase map's persistence flow.
  - Verified:
    - `ddd/core`: rebuilt; 533 tests in 32 files pass; lint is clean;
    - users-api: lint is clean (so `MikroOrmStore` satisfies the port); 753 tests in 108
      files pass (the 3 moved tests left);
    - `pnpm check` and `pnpm lint:persistence` pass;
    - `pnpm test:e2e`: 165 tests in 31 files pass.

- B9:
  - Moved with `git mv`: users-api `src/common/filters/feature-disabled.filter.ts` and its
    spec → `packages/pipeline-feature-flags/src/filters/`, exported with
    `FeatureDisabledFilterOptions` from the package entry.
  - Default behavior unchanged: 403 with `statusCode`, `error`, `message` and `flag`.
  - New option `{ status: 404 }`: a plain `{ statusCode: 404, error: 'Not Found',
    message: 'Not Found' }`. It omits the flag and the error message, because both name
    the gated feature. The old JSDoc advice ("adjust the status to 404"), and the README's
    hand-written 404 example, both kept the message.
  - The options parameter is `@Optional()`, so `{ provide: APP_FILTER, useClass:
    FeatureDisabledFilter }` keeps working; a spec pins the metadata, because a package
    may not use `@nestjs/testing`.
  - Spec: the 2 original cases kept; added the explicit 403, the 404 body (no flag or
    request name anywhere in it) and the optional parameter. The filter is 100% covered.
  - users-api: `src/bootstrap.ts` and `test/support/e2e-app.ts` import the filter from
    `@nestjs-pipeline/feature-flags`.
  - Docs: the package README ("Mapping the Error to HTTP" now uses the shipped filter; two
    API rows), the `FeatureDisabledError` JSDoc, and `ddd/users-api/CLAUDE.md`.
  - Verified:
    - feature-flags: rebuilt; lint is clean; 46 tests in 7 files pass;
    - users-api: lint is clean; 751 tests in 107 files pass (the 2 moved tests left);
    - `pnpm check` and `pnpm lint:persistence` pass;
    - `pnpm test:e2e`: 165 tests in 31 files pass;
    - `pnpm test:release`: "Release verification passed: 12 packed packages"; the packed
      feature-flags loads with 18 exports. There was no network: pnpm retried the registry,
      then installed from the local store.

- B10:
  - Moved with `git mv`: users-api `src/common/filters/unauthorized-action.filter.ts` and
    its spec → `packages/pipeline-casl/src/filters/`, exported from the package entry.
    Behavior and response body unchanged (403 with `statusCode`, `error`, `message`,
    `action`, `subject`); the JSDoc gained a registration example.
  - Spec: the 2 original cases kept; added the Fastify `send()` path, which was untested.
    The filter is 100% covered.
  - users-api: `src/bootstrap.ts`, `test/support/e2e-app.ts` and
    `test/cqrs-runtime-errors.spec.ts` import the filter from `@nestjs-pipeline/casl`.
  - Docs: the package README (Errors section shows the filter; one API row) and
    `ddd/users-api/CLAUDE.md`.
  - Verified:
    - casl: rebuilt; lint is clean; 192 tests in 7 files pass;
    - users-api: lint is clean; 749 tests in 106 files pass (the 2 moved tests left);
    - `pnpm check` and `pnpm lint:persistence` pass;
    - `pnpm test:e2e`: 165 tests in 31 files pass;
    - `pnpm test:release`: "Release verification passed: 12 packed packages"; the packed
      casl loads with 20 exports.

- B11:
  - Moved with `git mv`: users-api `src/common/mappers/create-mapper.helper.ts` and its spec
    → `packages/pipeline-zod/src/pipes/create-zod-mapper.ts`, exported as
    `createZodMapper` with a `ZodMapper` interface. It sits in `pipes/` beside `ZodPipe`
    because it throws a Nest HTTP exception, which `transport-neutral-errors.grit` allows
    only in presentation folders.
  - Failures throw `BadRequestException(error.flatten())`, as `ZodPipe` does, instead of
    `z.treeifyError(...)`. Parsing stays synchronous; the JSDoc says so.
  - Spec: the original success case kept; the failure case now asserts the exact
    `{ formErrors, fieldErrors }` body (it only checked the type before). Added: transform
    output and `schema` reuse, and a case proving the body equals `ZodPipe`'s for the
    same input. The module is 100% covered.
  - users-api: the five mappers import `createZodMapper` from `@nestjs-pipeline/zod`;
    `src/common/mappers/` is gone.
  - Docs: the package README (new `createZodMapper` section, contents entry, two API rows)
    and `ddd/users-api/CLAUDE.md`.
  - Verified:
    - zod: rebuilt; lint is clean; 141 tests in 14 files pass;
    - users-api: lint is clean; 747 tests in 105 files pass (the 2 moved tests left);
    - `pnpm check` and `pnpm lint:persistence` pass;
    - `pnpm test:e2e`: 165 tests in 31 files pass;
    - `pnpm test:release`: "Release verification passed: 12 packed packages"; the packed
      zod loads with 13 exports.

- C3 + A4:
  - `ddd/core/application/tenant-scope.ts`: new exported `TenantSource` type and
    `requireTenantId(source, purpose)`: an explicit string wins (an empty one fails), an
    object's `tenantId` comes next, then the `runWithTenant` scope; otherwise it throws
    `ddd/core`'s `MissingTenantContextError`. Full JSDoc with an example.
  - `filterCacheKey` and `cacheKeyTemplate` use it; their private `resolveTenantSchema` is
    gone, and `CacheKeyTenantSource` is now an alias of `TenantSource`, so no export
    changed. The 15 frozen keys and every fail-closed case pass unchanged.
  - users-api: `idempotent-operation.helper.ts` imports `requireTenantId` from
    `/application`; `src/common/cqrs/helpers/requireTenantId.helper.ts` (the duplicate
    class, which had no spec) is deleted.
  - **A4 reproduced first**: a filter spec with `ddd/core`'s error failed with 400. The
    filter now maps it to 500 with a generic `Internal server error` message, the body
    Nest's default handler gave users-api's old class, because the `ddd/core` message is
    guidance for developers. The JSDoc table lists it.
  - Dead-letter capture is unchanged: `EXPECTED_REJECTIONS` lists concrete classes, and
    its spec already uses `ddd/core`'s class as a capturable failure.
  - Specs: 7 `requireTenantId` cases in `tenant-scope.spec.ts` (`tenant-scope.ts` is 100%
    covered); the filter case; new `test/missing-tenant-boundary.e2e-spec.ts`, where a
    real `GET /users` whose handler rejects with the error answers the generic 500.
  - Docs: `ddd/core/README.md` (tenant section: `requireTenantId`, `TenantSource`, map
    the error to 500), `ddd/core/CLAUDE.md`, `ddd/users-api/CLAUDE.md`.
  - Verified:
    - `ddd/core`: rebuilt; 540 tests in 32 files pass; lint is clean;
    - users-api: lint is clean; 748 tests in 105 files pass;
    - `pnpm check` and `pnpm lint:persistence` pass;
    - `pnpm test:e2e`: 166 tests in 32 files pass (one new file).

- C4, part 1 (the move):
  - Moved with `git mv` into `ddd/core/persistence/cache/`: `mikro-orm.cache.ts`, its spec,
    `cache-adapter-conformance.spec.ts`, and `cache.entity.ts` → `cache-entry.ts`. users-api's
    `schemas/cache.schema.ts` is deleted; its mapping is now `createCacheEntrySchema(table)`
    and `CacheEntrySchema` in `cache-entry.ts` (table name validated like the audit sink's).
    All exported from `/persistence`.
  - `MikroOrmCache` is a plain class: no Nest decorators, constructor
    `(store: ITransactionalEntityManagerSource, { defaultTtlMs?, logger? })`. The N3
    `ICacheLogger` replaces the Nest `Logger` (default `console.warn` with a
    `[MikroOrmCache]` prefix; guarded by `safeWarn`). Fencing, identity-map bypass and
    expiry logic are unchanged.
  - **Schema fix**: `expiresAt` was `type: 'number'`, which MikroORM's schema generator
    creates as a 32-bit `int`, too small for epoch milliseconds. It is now
    `columnType: 'bigint'`, as in the migration. `test/cache-concurrency.e2e-spec.ts` no
    longer needs its `ALTER COLUMN ... TYPE bigint` workaround.
  - users-api: `persistence.module.ts` registers the cache with a `useFactory` provider,
    passing its store and the new `mikroOrmCacheLogger`; `persistence-entities.ts`
    registers `CacheEntrySchema`.
  - Specs: every moved case kept. The conformance spec's `User` case uses a local `Member`
    aggregate; the warning case passes `logger` instead of spying on a private field.
    Added: the default `[MikroOrmCache]` console warning, a throwing logger that does not
    fail the write, and `cache-entry.spec.ts` (default table, `bigint` expiry, accepted and
    rejected table names).
  - Docs: `ddd/core/README.md` (`MikroOrmCache` entry: construction, store port, schema),
    `ddd/core/CLAUDE.md`, `ddd/users-api/CLAUDE.md`, root `README.md` layout,
    `ddd/users-api/src/persistence/README.md` and the architecture skill. The last two
    described a conditional deletion of expired rows that the adapter no longer does; they
    now say that expired rows are reported as `expired` and kept.
  - Verified:
    - `ddd/core`: rebuilt; 582 tests in 35 files pass; lint is clean;
    - users-api: lint is clean; 717 tests in 103 files pass (the moved specs left);
    - `pnpm check` and `pnpm lint:persistence` pass;
    - `pnpm test:e2e`: 166 tests in 32 files pass, including the real-Postgres
      `cache-concurrency.e2e-spec.ts` on a table created from `CacheEntrySchema` alone.

- C4, part 2:
  - `createCacheTableSql(table = 'cache')` in `persistence/cache/cache-entry.ts`, exported:
    the migration's columns (`key` varchar(255) primary key, `value` text, `expires_at`
    bigint null, `revision` bigint default 0) plus `<table>_expires_at_idx`, with the table
    name validated. Spec pins the exact SQL, the schema-qualified index name and rejection.
  - `mikro-orm.cache.ts` is 100% covered (was 80.5%): new specs for the absent-key
    tombstone, a lost insert race, a missing revision, 16-conflict exhaustion, the four
    fills observed at revision 0, zero TTL and an expired value under `isNewer`.
  - New `ddd/users-api/test/mikro-orm-cache.postgres.e2e-spec.ts` (Testcontainers): creates
    the table with the helper and checks its columns and index, then round-trip with a
    bigint expiry, expiry keeping the revision, `isNewer`, delete advancing the revision,
    a stale fill rejected after invalidation, and exactly one of two competing fills.
  - Observed, not a defect: `set()` on an absent key inserts revision 1, then loops and
    writes through the compare-and-set path, ending at revision 2. Revisions are opaque
    and only need to advance; the suite asserts advancement, not numbers.
  - Verified:
    - `ddd/core`: 597 tests in 35 files pass; lint is clean;
    - users-api: lint is clean; 717 tests in 103 files pass;
    - `pnpm check` and `pnpm lint:persistence` pass;
    - `pnpm test:e2e`: 173 tests in 33 files pass; the new suite passed 3 separate runs.

- C5:
  - New `ddd/core/persistence/root-entity.properties.ts`, exported from `/persistence`:
    `rootEntityProperties(columns?: RootEntityColumns)` and `versionProperty(column?)`.
    Defaults are `id`, `created_at`, `updated_at` and `version`. JSDoc kept and extended.
  - The four users-api schemas import them from `@nestjs-pipeline/ddd-core/persistence`;
    users-api's `src/persistence/schemas/root-entity.properties.ts` is deleted.
  - New spec (7 tests): default mapping, partial overrides, fresh definitions per call,
    acceptance by an `EntitySchema`.
  - Docs: `ddd/core/README.md` entry, ownership lists in `ddd/core/CLAUDE.md` and
    `ddd/users-api/CLAUDE.md`.
  - Verified:
    - `ddd/core`: 604 tests in 36 files pass; build is clean;
    - users-api: 717 tests in 103 files pass; `pnpm lint` is clean;
    - `pnpm test:e2e`: 173 tests in 33 files pass (the schemas run on Postgres unchanged);
    - `pnpm check`, `pnpm lint:persistence` and `pnpm context:validate` pass.

- C6:
  - New `/http` entry point (`ddd/core/http/`, `package.json` `exports`, `tsconfig.json`,
    root barrel): `domainErrorHttpStatus(error)` returns `{ statusCode, error, message }`,
    or `undefined` for anything that is not a `DomainException`. An overload types the
    result of a `DomainException` as always defined. 500 for a missing tenant carries a
    generic message.
  - users-api `DomainExceptionFilter` keeps its own mappings and returns
    `domainErrorHttpStatus(exception)` for the rest; its responses are unchanged.
  - `domain-entry-point.spec.ts` also loads `dist/http/index.js` (no `@nestjs`, no
    `@mikro-orm`). New spec: 10 tests.
  - Docs: `ddd/core/README.md`, both `CLAUDE.md` files, map Conventions rows, the
    `ddd-entry-points.grit` message.
  - Verified:
    - `ddd/core`: 615 tests in 37 files pass; build is clean;
    - users-api: 717 tests in 103 files pass, filter specs unchanged; `pnpm lint` is clean;
    - `pnpm test:e2e`: 173 tests in 33 files pass;
    - `pnpm check`, `pnpm lint:persistence` and `pnpm context:validate` pass.

- C7:
  - `filter-cache-key.helper.ts`: `canonicalizeValue` takes `NonNullable<unknown>` and its
    `null`/`undefined` branch is gone; its only caller already excludes both.
  - `root-domain.event.ts`: `if (desc)` kept, because a Proxy may list a configurable key
    in `ownKeys` and report no descriptor for it; without the guard
    `Object.defineProperty` would throw. Covered by a new Proxy case in
    `domain.event.spec.ts`.
  - New `command-repository.abstract.spec.ts` runs the constructor through a subclass.
  - Verified:
    - the three files are at 100% statements, branches, functions and lines;
    - `ddd/core`: 617 tests pass; rebuild and lint are clean;
    - users-api: 717 tests pass;
    - `pnpm check`, `pnpm lint:persistence` and `pnpm context:validate` pass;
    - `pnpm test:e2e` not rerun: no runtime behavior changed.

- C8:
  - Most C8 docs were updated with each move (C1–C7). This step checked the rest against
    the source and fixed:
    - users-api `src/persistence/README.md`: `/persistence` imports instead of the root
      barrel; create and update repositories use `@PersistedWrite`; deletes use
      `optimisticDelete` and raise `ConcurrencyConflictError`, not `OptimisticLockError`;
      `@Cache` invalidates versioned caches and writes a barrier only to unversioned ones,
      for `barrierTtl` (60 s default), not `ttl: 0`; identity-map bypass covers every read.
    - users-api `src/common/filters/README.md`: the full status mapping and
      `domainErrorHttpStatus()`; the missing-tenant e2e suite.
    - `ddd/users-api/CLAUDE.md`: filter row and ownership sentence.
    - Codebase map: Critical Modules list what `ddd/core/persistence` and `/http` now own;
      users-api persistence no longer claims transient-error classification; the Biome
      plugin-spec glob matches both files.
    - `Cache.ts` JSDoc of `evictKey`: `@FromCache` bypasses unversioned adapters and treats
      a barrier as a miss.
  - Every file path named in the skill, the map, the `ddd/core` README and the users-api
    persistence README exists.
  - Verified: `pnpm check`, `pnpm lint:persistence`, `pnpm context:validate` pass;
    `ddd/core` 617 tests pass after the JSDoc change.

- A6:
  - New `ddd/users-api/test/postgres-audit-dead-letter.e2e-spec.ts` (Testcontainers
    Postgres, 8 tests): both adapters on tables from `createAuditTableSql()` and
    `createDeadLetterTableSql()`, default and schema-qualified; arrays, nested objects,
    Greek, CJK and emoji text; tagged BigInt and Infinity; JSON null versus SQL NULL.
  - Defect found and fixed: `jsonb` rejects a NUL character ("unsupported Unicode escape
    sequence") and a lone surrogate ("invalid input syntax for type json"), so either
    one in a payload or error message failed the whole `INSERT`; the dead-letter behavior
    logs that and the dead letter is lost. New `toPostgresJson(json)` in
    `@nestjs-pipeline/core` (`helpers/postgres-json.ts`, exported, 7 specs) replaces only
    those escapes with U+FFFD, keeping escaped backslashes and valid surrogate pairs.
    `PostgresAuditSink` and `PostgresDeadLetterTransport` use it; a unit spec each and the
    e2e suite pin it. READMEs of core, audit and deadletter updated.
  - New `ddd/users-api/test/redis-idempotency-store.e2e-spec.ts` (Testcontainers Redis,
    real node-redis `@redis/client` 5.12.1, added as a users-api devDependency from the
    local store, 10 tests): claim with TTL, one winner of 10 concurrent claims,
    complete-if-owned with the new TTL, ownership lost after expiry for complete and
    delete, completed or absent records not completed, release then reclaim, `set` and
    `delete`, key prefix.
  - Corrupt-value inconsistency settled: both behaviors fail closed and stay. `get()`
    throws `SyntaxError`, so the request fails before the handler runs; the Lua scripts
    cannot prove ownership, so they return `false` and leave the value untouched;
    `setIfAbsent` also leaves it. Documented in `redis.store.ts` and the idempotency
    README; the e2e suite pins it. The README and JSDoc now say node-redis v4 or later.
  - Open: the same `jsonb` limit in `PostgresIdempotencyStore` (see Open Questions).
  - Verified:
    - `pnpm build`, `pnpm test` (every workspace), `pnpm lint`, `pnpm check` and
      `pnpm lint:persistence` pass;
    - `pnpm test:e2e`: 191 tests in 35 files pass;
    - `pnpm test:release`: 12 packed packages pass.

- B1:
  - Core's coverage block (`enabled`, `include: ['src/**/*.ts']`, `perFile`, 100% on all
    four metrics) added to the `vitest.config.ts` of audit, cache, casl, deadletter,
    feature-flags, idempotency, opentelemetry, rate-limit, resilience and zod. Rate-limit
    and zod were already at 100%.
  - 20 files closed, almost all with behavior tests (audit +9, deadletter +4, cache +4,
    feature-flags +10, opentelemetry +4, resilience +4). No ignore directive, no
    exclusion, no production seam; no defect found.
  - Two branches removed as unreachable:
    - casl `helpers/ability.ts`: `p1 ?? p2 ?? ''` became `p1 ?? p2`. Each alternative of
      the placeholder regex has one capture group of at least one character, so every
      match sets exactly one of them.
    - idempotency `idempotency.behavior.ts`: the snapshot `catch` logs
      `(cause as TypeError).stack`. The only call in that `try` is `toJsonSnapshot`,
      whose own `catch` rethrows every failure as a `TypeError`.
  - A spec comment in feature-flags that told history was reworded to state the
    requirement. `packages/CLAUDE.md` now states the coverage rule.
  - Verified:
    - `pnpm build`, `pnpm test` (exit 0, every package at its enforced 100%),
      `pnpm lint`, `pnpm check` and `pnpm lint:persistence` pass;
    - `pnpm test:e2e`: 191 tests in 35 files pass;
    - `pnpm test:release`: 12 packed packages pass;
    - no `v8`/`c8`/`istanbul` ignore directive under `packages/*/src`.

- B2:
  - `"engines": { "node": ">=22.0.0" }` added after `license` in the 12 package manifests
    and `ddd/core/package.json`.
  - Enforced: `integration/packages/release.mjs` rejects a packed manifest whose
    `engines.node` differs from the root's (README updated); `ddd/core`'s
    `package-manifest.spec.ts` asserts the same for `ddd/core`.
  - Verified: `ddd/core` 618 tests pass; `pnpm test:release` passes, and fails with
    "engines.node must be the root's" when one manifest is set to `>=20` (then restored);
    `pnpm check` passes; `pnpm install --offline` leaves the lockfile unchanged.

- B3:
  - 11 package READMEs: `../../LICENSE`, `../../COMMERCIAL_LICENSE.txt`, casl's
    `./LICENSE`/`./COMMERCIAL_LICENSE.txt`, `../../README.md#...` and `../pipeline-*` are
    absolute `https://github.com/aristoteliss/nestjs-pipeline/{blob,tree}/master/...`
    URLs; every target exists on `master`. The cache README's architecture-skill sentence
    is removed. Correlation had none.
  - Enforced: `release.mjs` requires `README.md` in every tarball and rejects one that
    contains `](../` (README updated).
  - Verified: `grep -nE "\]\(\.\./" packages/*/README.md` prints nothing;
    `pnpm test:release` passes, and fails with "README links outside the package" when a
    relative link is appended to one README (then restored); Biome clean.
  - `ddd/core/README.md` has 13 such links; added to D1.

- B4: the class JSDoc of `PostgresIdempotencyStore` moved from above `assertLeaseTtl`'s
  comment onto the class, unchanged. Verified: the built `postgres.store.d.ts` carries it
  on `export declare class PostgresIdempotencyStore`; idempotency 140 tests, lint and
  Biome pass.

- B8: the missing-`key` diagnostic's `fix` in `cache.behavior.ts` names only
  `createPartitionedCacheKeyFactory(...)`. The existing spec pins the exact text; a new
  spec extracts every `name(...)` from the fix and asserts each is exported from the
  package's `index.ts`. Verified: cache 93 tests at 100% coverage, lint and Biome pass;
  users-api 717 tests pass; nothing else asserts the old text.

- B7: both install lines in `packages/pipeline-correlation/README.md` add the required
  peers `@nestjs-pipeline/core` and `@nestjs/common` (the `peerDependencies`, neither
  optional). Verified against `package.json`; `pnpm test:release` still passes.

- D4:
  - `ddd/core/vitest.config.ts` enforces core's thresholds (`perFile`, 100% on all four
    metrics) over `index.ts`, `application/`, `domain/`, `http/`, `persistence/` and
    `types/`. Only `persistence/decorators/Cache.ts` was short; both gaps were reachable:
    - the outer maintenance `catch`: a JavaScript caller's `invalidateKeys` returning a
      non-list makes the key loop throw. New spec: the write still resolves and one
      "Unexpected error during cache maintenance" warning is logged;
    - `isNewer: null` (documented as disabling CAS): new spec asserts the unversioned
      `set` receives `isNewer: undefined`.
  - `ddd/core/CLAUDE.md` states the coverage rule.
  - Verified: `pnpm --filter @nestjs-pipeline/ddd-core test` exits 0 with 620 tests at
    100%; lint and Biome pass; no ignore directive in `ddd/core`.

- U1:
  - New `packages/uuidv7` (`@cqrs-ddd/uuidv7` 0.2.0): `src/uuidv7.ts` is core's file
    byte for byte (`diff` empty), full JSDoc and bit layout kept; `src/index.ts` exports
    `uuidv7` and `isUuidV7`. Manifest: `files`, `license`, `engines` `>=22.0.0`,
    `publishConfig` public, `repository.directory`, `prepublishOnly`, no dependencies or
    peers. `author` is `Aristotelis` without the e-mail the other manifests carry, and
    the README has no contact line (organization rule on personal data); the owner may
    align both.
  - Specs (16 tests, 100% coverage enforced): core's and `ddd/core`'s cases merged
    (`uuidv7.spec.ts`), plus uppercase and wrong-variant rejections; new
    `uuidv7.layout.spec.ts` mocks `node:crypto` and `Date.now` and pins the exact output
    for all-zero and all-one random bytes and the largest 48-bit timestamp; new
    `package-manifest.spec.ts`.
  - README: purpose, install, API, format guarantees (bit table, ordering, no monotonic
    counter, clock caveat, what `isUuidV7` checks).
  - `packages/pipeline/src/package-boundaries.spec.ts`: the peer-on-core rules apply to
    `@nestjs-pipeline/*` siblings only; new rules: every workspace is in one of the two
    scopes, and each `@cqrs-ddd/*` package has no dependency or peer matching `@?nestjs`.
  - `packages/CLAUDE.md` names the `@cqrs-ddd/*` exception. Codebase map regenerated.
  - Verified: `framework-independence.grit` fires on a probe file with a NestJS import in
    `packages/uuidv7/src` (then deleted); `pnpm install --frozen-lockfile --offline`,
    `pnpm lint`, `pnpm check`, `pnpm lint:persistence` and `pnpm test` exit 0 (core 334);
    `pnpm test:release`: 13 packed packages; the tarball holds only `dist`, README,
    `package.json` and the licenses.

- U2:
  - `@cqrs-ddd/uuidv7` added with `workspace:^` to the `dependencies` of core,
    correlation and `ddd/core`, and with `workspace:*` to users-api's `devDependencies`.
  - Core: `src/index.ts` re-exports `isUuidV7, uuidv7` from it, `pipeline-runner.ts`
    imports it, and `src/helpers/uuidv7.ts` and its spec are deleted (cases merged in U1).
    Correlation's `helpers/uuidv7.ts` re-exports it instead of core's. `ddd/core`:
    `domain.event.ts`, `root.entity.ts`, `cache-barrier.helper.ts` and two specs import
    it; `domain/utils/uuidv7.ts` and its spec are deleted. users-api: six specs import it.
  - Manifest rules: core's `package-boundaries.spec.ts` and `ddd/core`'s
    `package-manifest.spec.ts` pin their `dependencies` to exactly
    `{ '@cqrs-ddd/uuidv7': 'workspace:^' }`. `packages/CLAUDE.md`,
    `packages/pipeline/CLAUDE.md`, the root, core and `ddd/core` READMEs state the
    exception.
  - Defect found and fixed in `integration/packages/release.mjs`: the consumer's
    `pnpm.overrides` in `package.json` is ignored by pnpm 11 (it warned), so the first
    runtime dependency between packed packages was fetched from the registry (404).
    The overrides now go in the consumer's `pnpm-workspace.yaml`; README updated.
  - Verified:
    - `grep -rn "function uuidv7" packages ddd --include=*.ts` finds only
      `packages/uuidv7/src/uuidv7.ts`;
    - the built core and correlation `uuidv7` (and core's `isUuidV7`) are the same
      function objects as `@cqrs-ddd/uuidv7`'s;
    - `pnpm install --frozen-lockfile --offline`, `pnpm build`, `pnpm lint`, `pnpm check`,
      `pnpm lint:persistence` and `pnpm test` exit 0;
    - `pnpm test:e2e`: 191 tests in 35 files pass;
    - `pnpm test:release`: 13 packages; every `@nestjs-pipeline/*` export count equals
      the Gate 1 run (core 37, correlation 14); no ignored-field warning.

- U3:
  - Pickup confirmed without changes: `copy-licenses` copied `LICENSE` and
    `COMMERCIAL_LICENSE.txt` into `packages/uuidv7`; `test:release` packs it;
    `publish:all` (`pnpm -r publish`) covers it, since `pnpm -r ls` lists it among the 13
    non-private workspaces. Nothing was published.
  - New standalone stage in `integration/packages/release.mjs` (README updated): every
    packed `@cqrs-ddd/*` package is installed alone in an empty consumer, with overrides
    for itself and its packed dependencies only. It fails when a dependency is outside
    the release, when `pnpm ls --depth Infinity` shows any other package, or when
    `require()` of the root yields no exports.
  - Verified: `pnpm test:release` passes with "13 packed packages (1 standalone)" and
    `@cqrs-ddd/uuidv7 standalone 2`; with `tslib` added to its `dependencies` (then
    restored) the check exits 1 with "depends on packages outside this release: tslib".

- S1:
  - New `packages/safe-stringify` (`@cqrs-ddd/safe-stringify` 0.2.0). `stableStringify.ts`,
    `safeStringify.ts` and `key-segment.ts` are core's files byte for byte, and their
    specs are core's with only the one `../helpers/safeStringify` import path changed
    (`diff` checked). No internals were shared or refactored: the strict path is untouched.
  - `src/index.ts` exports both families and the key helpers, as core does (10 runtime
    exports). Manifest, tsconfigs, enforced 100% coverage and manifest spec as in U1.
  - New `golden-output.spec.ts`: exact strings computed from core's current build (not
    from the copy under test) for `stableStringify` (nested unsorted keys, arrays and
    number forms, dates, `toJSON`, unicode keys, string escapes) and `joinKeySegments` /
    `escapeKeySegment` (`:`, `\`, both, `undefined`/`null`, a literal `\-`).
  - README: the strict/safe comparison and rule (never `safeStringify` for keys), both
    APIs, `SanitizeOptions`, that `safeStringify` redacts nothing unless `redactKeys` is
    passed while `redactValue` applies `DEFAULT_REDACT_KEYS`, and the key-segment format.
    Every example was run against the build.
  - `packages/CLAUDE.md` lists both `@cqrs-ddd/*` packages.
  - Verified: 86 tests at 100% coverage; `framework-independence.grit` fires on a NestJS
    probe file (deleted); frozen install, `pnpm lint`, `pnpm check`,
    `pnpm lint:persistence` and `pnpm test` exit 0; `pnpm test:release`: 14 packed
    packages, 2 standalone (`@cqrs-ddd/safe-stringify standalone 10`).

- S2:
  - `@cqrs-ddd/safe-stringify` added with `workspace:^` to the `dependencies` of core,
    cache, idempotency, rate-limit, audit, deadletter and `ddd/core`, and with
    `workspace:*` to users-api's `dependencies` (its production code uses it).
  - Core: `src/index.ts` re-exports the 12 names explicitly (10 values, 2 types) from the
    package in place of the two `export *` lines and the key-segment export;
    `logging.behavior.ts` imports from it; `helpers/stableStringify.ts`,
    `safeStringify.ts`, `key-segment.ts` and their specs are deleted (moved in S1).
  - Packages and users-api: every import or re-export of those names from
    `@nestjs-pipeline/core` was split by a script into a core import (for the other
    names) and a package import (17 files). Public re-exports stay in cache, idempotency,
    audit (`helpers/redact.ts`) and deadletter.
  - `ddd/core`: the N5 copy `persistence/helpers/stable-stringify.ts` is deleted; its
    fuller JSDoc (boundary list, "must never change", `cause`) is merged into the
    package's `stableStringify`, and its 15-test spec moved into the package as
    `stableStringify.keys.spec.ts`. `cacheKeyTemplate`'s `replace(/([\\:])/g, '\\$1')`
    became `escapeKeySegment(...)`: same output, because the second pass only touches
    colons, which the first never creates.
  - Manifest specs pin core's and `ddd/core`'s `dependencies` to the two `@cqrs-ddd/*`
    packages. Docs: `packages/CLAUDE.md`, `packages/pipeline/CLAUDE.md`, the root,
    core (a note below its export table) and `ddd/core` READMEs.
  - Verified:
    - the `grep -rnE "function (stableStringify|...)"` finds only
      `packages/safe-stringify/src`;
    - core's 10 re-exported values, cache and idempotency `stableStringify`, and audit
      and deadletter `redactValue`/`REDACTED`/`DEFAULT_REDACT_KEYS` are the package's own
      objects;
    - frozen install, `pnpm build`, `pnpm lint`, `pnpm check`, `pnpm lint:persistence`
      and `pnpm test` exit 0 (the golden, fingerprint, logging, audit and dead-letter
      specs pass; the fingerprint spec changed only its import line);
    - `pnpm test:e2e`: 191 tests in 35 files, including
      `cache-key-canonicalization.e2e-spec.ts`;
    - `pnpm test:release`: 14 packages, 2 standalone; every `@nestjs-pipeline/*` export
      count equals Gate 1.

- S3: no change needed. `copy-licenses`, `test:release` and `publish:all` cover
  `packages/safe-stringify` like any `packages/*` workspace, and U3's standalone stage
  applies to every `@cqrs-ddd/*` package. Verified in the S2 run of `pnpm test:release`:
  `@cqrs-ddd/safe-stringify standalone 10`, "14 packed packages (2 standalone)".

- D1 (from here on, `ddd/core` in earlier entries means `packages/ddd-core`):
  - `git mv ddd/core packages/ddd-core`; `pnpm-workspace.yaml` already covers
    `packages/*`. The tsconfig, vitest and spec paths that reach the root are at the same
    depth, so none changed.
  - `biome.json`: the four `**/ddd/core/**` globs (`transport-neutral-errors`,
    `core-environment`, `framework-independence`, `aggregate-identity`) point at
    `**/packages/ddd-core/**`. The `packages/*/src/**` globs do not match it (no `src/`),
    hence the explicit globs. `verify-package-licenses.grit` and `package-licenses.grit`
    now also cover it; it has no real `@nestjs-pipeline/ddd-*` import.
  - `biome-general-plugins.spec.ts` fixture paths and titles use `packages/ddd-core`.
  - `package-boundaries.spec.ts` skips `private: true` workspaces (it covers published
    packages), so the private `ddd-core` is not held to the pipeline-package rules.
  - Docs: every `ddd/core` reference outside this task file now says `packages/ddd-core`
    (AGENTS, CLAUDE, root and `.claude` READMEs, the skill, `biome/plugins/README.md`,
    `framework-independence.grit`, nested `CLAUDE.md` files, users-api persistence
    README's relative link, map manual sections). The root README's DDD section no longer
    says "Nest-oriented", lists four entry points including `/http`, and replaces the
    non-existent `Mutate` row with `@ApplyMutation()` and `@Mutable()`.
    `packages/CLAUDE.md` describes the private workspace.
  - Deferred to D1a: `packages/ddd-core/README.md`'s relative links, because their targets
    move to `api/` there.
  - Verified: a probe file in `packages/ddd-core/application/` with a Nest import, a
    `process.env` read and a Nest HTTP exception gets the `framework-independence`,
    `core-environment` and `transport-neutral-errors` diagnostics (then deleted); frozen
    install, `pnpm build`, `pnpm lint`, `pnpm check`, `pnpm lint:persistence` and
    `pnpm test` exit 0 (`packages/ddd-core` 590 tests, the same as after S2: its 27-test
    `stable-stringify.spec.ts` moved to safe-stringify, which went 86 → 113);
    `pnpm test:e2e` 191 tests; `pnpm test:release` passes; no `ddd/core` reference remains
    outside this file.

- D1a (from here on, `ddd/users-api` and "users-api" paths in earlier entries mean `api/`):
  - `git mv ddd/users-api api`, `ddd/` removed. Package renamed
    `@nestjs-pipeline/ddd-api` (private). The local, untracked `.env` moved with it and
    was not read.
  - Config: `pnpm-workspace.yaml` (`api`), `api/tsconfig.json` (`../tsconfig.base.json`),
    root scripts (`--filter @nestjs-pipeline/ddd-api`; `test:last:review` matches
    `packages/<name>` or `api`), `.gitignore`, `.vscode/launch.json`,
    `release.mjs` (rejects a range pointing into `api/` or the `ddd-api` name),
    `package-boundaries.spec.ts` comments and title.
  - `biome.json`: 18 `ddd/*/src` and `ddd/users-api/src` globs → `**/api/src/**`. An
    anchored `api/src/**` form was tried first and matched nothing, silently; the probe
    caught it.
  - Grit: `verify-package-licenses.grit` matches `../../api/` instead of `../../ddd`, and
    its message names the api application; `ddd-entry-points.grit` and
    `event-handler-substance.grit` texts updated. Plugin-spec fixtures use `api/src/...`
    and `../../api/src/...`.
  - Fixes found by the move: `test/docs-cache-security.spec.ts` climbed one level too
    many with `resolve(__dirname, '..', '..', '..')`; `test/users.e2e-spec.ts` imported
    `../../src/...` from `test/`, which never existed and only worked through Vite's
    fallback, now `../src/...`.
  - Docs: relative links in the moved `api/` Markdown were recomputed (all resolve);
    `ddd/users-api` → `api` and the package name in every other document; the root
    README layout tree lists `api/`, `packages/ddd-core`, `packages/uuidv7` and
    `packages/safe-stringify`; `packages/ddd-core/README.md`'s 12 relative links are
    absolute `blob/master/...` URLs (they resolve on `master` once this branch is
    merged) and its architecture-skill link is replaced by a sentence.
  - Lockfile: importer `api`, link paths `../packages/...`; pnpm also deduped
    `@keyv/postgres`'s `pg` 8.22.0 → 8.23.0, `fastify`'s `find-my-way` 9.6.0 → 9.7.0 and
    `@types/node` 25.9.5 → 26.2.0, all versions already in the lockfile and in range.
  - Verified:
    - the D1a grep for `ddd/users-api`, `ddd/core` and `ddd/*` finds only this file and
      `@cqrs-ddd/*` text; every relative Markdown link resolves except the codebase map's
      root-relative generated links (unchanged convention);
    - a probe in `api/src/users/cqrs/commands/` gets the `transport-neutral-errors` and
      `ddd-entry-points` diagnostics (then deleted);
    - frozen install, `pnpm build`, `pnpm lint`, `pnpm check`, `pnpm lint:persistence`,
      `pnpm test` exit 0 (`api` 717, `packages/ddd-core` 590); `pnpm test:e2e` 191 tests;
      `pnpm test:release` passes; `pnpm context:validate` passes.
    - Observed once, not reproduced: in one full `pnpm test` run a Vitest fork worker in
      idempotency exited unexpectedly (88 of 140 tests ran, so coverage failed). Three
      isolated runs and the next full run passed with 140 tests.

- D1b (from here on, `@nestjs-pipeline/ddd-core` in earlier entries means `@cqrs-ddd/core`):
  - 213 occurrences in 134 files replaced (96 in `api/src`, 17 in `api/test`, the
    package itself, Grit rules, docs); `exports` subpaths unchanged. The folder stays
    `packages/ddd-core`. `api/package.json` depends on `@cqrs-ddd/core` (sorted).
  - `ddd-entry-points.grit`, `ddd-layering.grit` and `persistence-lifecycle.grit` match the
    new name. `verify-package-licenses.grit` also rejects `@cqrs-ddd/core` imports from
    packages, and `biome.json` no longer applies it to `packages/ddd-core` itself; the two
    utility packages stay allowed. `release.mjs` rejects a published dependency on
    `@cqrs-ddd/core`. New plugin specs: a package importing `@cqrs-ddd/core/domain` is
    rejected; one importing both utilities is clean.
  - Verified: the D1b grep for `@nestjs-pipeline/ddd-core` (`.ts`, `.json`, `.grit`, `.md`,
    no `node_modules`/`dist`) finds only this file; probes: the root barrel and
    `/persistence` in `api/src/**/cqrs/` and `@cqrs-ddd/core/domain` in a pipeline package
    each get their diagnostic (then deleted); frozen install, `pnpm build`, `pnpm lint`,
    `pnpm check`, `pnpm lint:persistence`, `pnpm test` exit 0 (`@cqrs-ddd/core` 592,
    `api` 717); `pnpm test:e2e` 191 tests; `pnpm test:release` passes;
    `pnpm context:validate` passes.

- D2:
  - `release.mjs` standalone stage, two phases per `@cqrs-ddd/*` package: with only the
    package and its packed dependencies installed (and nothing else, so no NestJS), it
    loads every `exports` entry, or for a package with optional peers the entries in the
    new `PEER_FREE_ENTRIES` table (`@cqrs-ddd/core`: `/domain`, `/application`, `/http`).
    Then it adds the optional peers at the version installed in the package's own
    `node_modules`, fails if any `@?nestjs` package appears, and loads the remaining
    entries. The main consumer no longer imports `@cqrs-ddd/*` roots. README updated.
  - `@cqrs-ddd/core` is still private here, so the committed check covers it only after
    D3.
  - Verified: `pnpm test:release` passes as committed (14 packages, 2 standalone). With
    `private` removed locally (then restored): passes with 15 packages, 3 standalone;
    `/domain` 15, `/application` 7, `/http` 1 exports without MikroORM, root 54 and
    `/persistence` 32 with it. With an `import '@mikro-orm/core'` appended to
    `domain/index.ts` as well (then restored and rebuilt), it exits 1 with "Cannot find
    module '@mikro-orm/core'". Biome clean.

- D3:
  - `packages/ddd-core/package.json`: `private` removed; new description (framework-neutral
    DDD building blocks); `author` `Aristotelis` without e-mail (as U1); `repository`
    with `directory`, `homepage`, `bugs`, `keywords`, `publishConfig` public,
    `prepublishOnly: pnpm run rebuild`. Already in place: name (D1b), version 0.2.0,
    `engines` (B2), `./http` export (C6), `@mikro-orm/core` as the only, optional, peer.
    A key-by-key comparison with the previous manifest shows only those changes.
  - Docs: the package `CLAUDE.md` scope, its README (no "private workspace"; an npm/pnpm
    install section with the optional MikroORM note), the root README, `packages/CLAUDE.md`,
    `biome/plugins/README.md`, and `package-boundaries.spec.ts` comments and title.
  - Verified: frozen install, `pnpm build`, `pnpm lint`, `pnpm check`,
    `pnpm lint:persistence`, `pnpm test` exit 0 (core 266: the 264 since S2, whose 68
    moved to safe-stringify, plus 2 boundary cases for the newly published package;
    `@cqrs-ddd/core` 592); `pnpm test:e2e` 191 tests; `pnpm test:release`: 15 packed
    packages, 3 standalone (`/domain` 15, `/application` 7, `/http` 1 without MikroORM,
    root 54 and `/persistence` 32 with it). The tarball holds `dist`, README, licenses
    and `package.json` only (no specs), with `private` absent and the `workspace:^`
    ranges rewritten to `^0.2.0`. Nothing was published.

- T1:
  - New `packages/pipeline-tenant` (`@nestjs-pipeline/tenant` 0.2.0): `package.json`
    (peers `@cqrs-ddd/core` and `@nestjs-pipeline/core` `workspace:^`, `@nestjs/common`
    `^11.0.0`, `reflect-metadata` `^0.1.13 || ^0.2.0`; devDependencies `workspace:*` plus
    `@mikro-orm/core`, which the spec's `/persistence` import needs; no `dependencies`;
    `author` without e-mail), `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`
    (100% per file), `src/index.ts` (`TenantScopeBehavior` only), and README (install line
    with every peer, registration first in the `'all'` `before` list, the tenant order,
    fail-closed without a tenant, absolute links only).
  - `src/tenant-scope.behavior.ts` and its spec copied from `api/src/infrastructure/behaviors/`
    with only the `ddd-core` wording changed; T2 deletes the `api` copies.
  - Pulled forward from T3: `verify-package-licenses.grit` now rejects `@cqrs-ddd/core`
    except where `$filename` matches `/packages/pipeline-tenant/`, and still rejects `api`
    and `ddd-` imports there. `biome-general-plugins.spec.ts`: the rejection case also runs
    on `packages/pipeline-tenant-extra/`, plus cases for the allowed tenant import and the
    tenant package importing `api`. `release.mjs` accepts `@cqrs-ddd/core` only as a peer
    of `@nestjs-pipeline/tenant` (`isTenantBridgePeer`). `packages/CLAUDE.md`,
    `biome/plugins/README.md` (also its stale `ddd/` wording) and
    `integration/packages/README.md` updated.
  - Codebase map regenerated (`pnpm context:update`); no manual section named the package.
  - Verified: `pnpm --filter @nestjs-pipeline/tenant test` 3 tests at 100%; `build` emits
    `dist/index.js` and `dist/index.d.ts`; frozen install, `pnpm build`, `pnpm lint`,
    `pnpm check`, `pnpm lint:persistence`, `pnpm test` exit 0 (core 269 = 266 + 3 sibling
    boundary cases; `@cqrs-ddd/core` 595 = 592 + 3 plugin cases; `api` 717);
    `pnpm test:release`: 16 packed packages, the tenant package loads in the consumer.
    Probes (removed): a `@cqrs-ddd/core` import in `packages/pipeline-cache` and `api`/`ddd-`
    imports in `packages/pipeline-tenant` are reported. Negative: `@cqrs-ddd/core` moved
    to `dependencies` (then restored) fails `release.mjs` with "invalid published
    dependency". `pnpm context:validate` 58 passed.
- T2:
  - `api/package.json`: `@nestjs-pipeline/tenant` `workspace:*`.
  - `api/src/infrastructure/observability.module.ts` imports `TenantScopeBehavior` from the
    package; still first in the `'all'` `before` list.
  - Deleted `api/src/infrastructure/behaviors/tenant-scope.behavior.ts` and its spec.
  - Wording updated to the package and `@cqrs-ddd/core`: `api/README.md`,
    `api/src/common/cqrs/helpers/README.md` (also its stale serializer sentence, now
    `@cqrs-ddd/safe-stringify`), comments in `api/test/read-model-freshness.spec.ts` and
    `api/test/overview-repository-cache-freshness.spec.ts`. Codebase map regenerated.
  - `packages/ddd-core/README.md` still shows a hand-written `TenantScopeBehavior`
    example; D5 replaces it with `@nestjs-pipeline/tenant`.
  - Verified: frozen install, `pnpm build`, `pnpm lint`, `pnpm check`,
    `pnpm lint:persistence`, `pnpm test` exit 0 (`api` 714 = 717 − the 3 moved tests);
    `pnpm test:e2e` 191 tests, unchanged. `api` and the tenant package resolve
    `@cqrs-ddd/core` to the same directory (`packages/ddd-core`).
    `pnpm context:validate` 58 passed.
- T3 (the rule, release and `packages/CLAUDE.md` parts were done in T1):
  - `packages/pipeline/src/package-boundaries.spec.ts`: two cases. No published manifest
    except `@nestjs-pipeline/tenant` names `@cqrs-ddd/core` in `dependencies`,
    `peerDependencies` or `optionalDependencies`; the tenant package declares it as a
    `workspace:^` peer and in neither of the other two.
  - Root `README.md`: the package in "Packages", "Current Package Versions", the Quick
    Start install list and the layout tree. Also fixed the `/domain` import example, which
    named a nonexistent `Mutate` export (now `ApplyMutation`; all four names checked
    against the built entry).
  - Not done, for the owner: the "Packages" and "Current Package Versions" tables still
    omit the three `@cqrs-ddd/*` packages.
  - Verified: `pnpm check`, `pnpm lint`, `pnpm lint:persistence`, `pnpm test` exit 0
    (core 271 = 269 + 2); `pnpm test:release` packs 16 packages, installs the packed
    `@cqrs-ddd/core` as the tenant peer and loads `@nestjs-pipeline/tenant` (1 export).
    Negative (then restored, lockfile included, since pnpm reinstalled on the edit): a
    tenant `dependencies` entry fails the peer-only case; a `@cqrs-ddd/core` peer on
    `@nestjs-pipeline/cache` fails the only-tenant case.

## Tests and Verification

Per step: the affected package's `test` and `lint`, and
`pnpm --filter @nestjs-pipeline/ddd-users-api test`. At the end: `pnpm test`, `pnpm lint`,
`pnpm check`, `pnpm lint:persistence`, `pnpm test:e2e` (Docker), `pnpm test:release`,
`pnpm context:update`, `pnpm context:validate`.

## Risks

- N5 (phase 1 temporary copy), S1/S2 and the `cacheKeyTemplate` change move the
  key-producing code (`stableStringify`, `joinKeySegments`, the
  `cacheKeyTemplate` escaping). Any byte of difference silently changes cache keys,
  rate-limit buckets and idempotency fingerprints. The golden specs are mandatory and must
  exist before the move.
- N2/N3 change `ddd/core`'s public types (`EventBus` → publisher port, logger
  configuration). Structural compatibility keeps Nest users working, but these changes
  belong in the release notes.
- D1, D1a and D1b change many repo paths and names. Grit rules must still fire on the new
  paths and name; `biome/*-plugin.spec.ts` and the D1a probe prove it. A missed
  `biome.json` glob would switch architecture checks off without any error.
- A6 can expose real adapter defects. Treat each as a bug fix with release-note impact.

## Open Questions

- (2026-09-25, found in A6) `PostgresIdempotencyStore` binds `JSON.stringify(response)` into
  a `jsonb` column, so a handler response containing a NUL character or a lone surrogate
  fails `completeIfOwned` after the handler already succeeded: the caller gets
  `IdempotencyCompletionError` and the claim stays until its TTL. Using `toPostgresJson`
  there would succeed, but a replay would then return U+FFFD where the original response
  had those characters. Owner to choose: keep failing, or store with the replacement.

## Next Steps

Phase 1:
1. A1, A3;
2. N1–N6, with A2 and A5;
3. A7;
4. C1, C2;
5. B9–B11 (users-api code that belongs in packages);
6. C3 with A4 (done);
7. C4–C8 (done);
8. A6 (done);
9. B1–B4, B7, B8;
10. D4 (done);
11. Gate 1 (green).

Phase 2 (after Gate 1):
1. U1–U3, then S1–S3 (section H is the reference);
2. D1, D1a, D1b together, then D2, D3;
3. T1–T3;
4. D5;
5. Gate 2.

Phase 3: B5 (release notes), then E1–E4.

## Snapshot Impact

Map update after U and S (new packages, removed core helpers), after N, after C1–C6 and
after D1/D1a/D1b (new top-level `api/`, `ddd/` removed), and after T1 (new package). Run
`pnpm context:update`, then fix the manual sections that name moved files (Critical
Modules, Directory Map, Gotchas) and the nested `CLAUDE.md`.

## Last Updated

2026-09-25
