# Task Context

## Task

Move every package and the `api` application from NestJS 11 to NestJS 12, together with
the other major dependency updates, one group of packages at a time, and simplify with
Nest 12 where it keeps or extends functionality. Work happens on `develop`.

## Goal

All workspaces build, type-check and pass their unit and end-to-end tests on NestJS 12,
`@nestjs/cqrs` 12 and the updated toolchain. Every `@nestjs-pipeline/*` package declares
`^12.0.0` Nest peers, and CHANGELOG and README document the change for a 0.3.0 release.

## Scope

In scope: `packages/*`, `api/`, `integration/`, the root `package.json`, `CHANGELOG.md`,
`README.md`, the package READMEs and the context files.

Out of scope: moving the repository to native ES modules (`.claude/tasks/esm-migration.md`,
0.4.0), the defects that already existed on `master` (fixed there separately, see the
findings),
GraphQL, NATS, Terminus, `@nestjs/config` and the Nest CLI build tooling.

## Current Status

In progress: step 12 is done except tags and publishing; 10.5 waits for an upstream
release. Steps 0 to 11c are done (8c, 11b and 11c evaluated and not adopted). On
2026-10-01 the step commits were squashed into `feat!: NestJS 12 across the packages and
the api`, which sits on `master`'s fix of the defects found during the upgrade. The hashes
in the Plan name the original step commits, which are no longer on any branch.

## How to work each step

1. Raise only the dependencies the step names, in only the workspaces it names (edit the
   manifest, then `pnpm install`). Use dev ranges pnpm's minimum release age accepts
   (`^12.1.1` for `@nestjs/common` and `@nestjs/core`); if pnpm writes a
   `minimumReleaseAgeExclude` entry into `pnpm-workspace.yaml`, lower the range instead.
2. Read the linked breaking-change pages and apply the listed checks.
3. Verify: the workspace's `build`, `lint` and `test` (run separately, not as one pnpm
   call), then repository-wide `pnpm check`, `pnpm lint` and `pnpm test`. Run
   `pnpm test:release` whenever a published export or peer changes.
4. For runtime wiring, check the package in a scratch Nest 12 app: a CommonJS script in
   the session scratchpad that requires the package's built `dist` and Nest 12 from
   `packages/pipeline/node_modules`, and dispatches through a real `CommandBus`/`QueryBus`.
5. Tick the step, record the result below, update the README requirement line when the
   package contract changes, and commit the step on its own after the user approves.

## Plan

Done (one commit each unless noted):

- [x] 0. Baseline green on `master` manifests: 20 workspaces, 3055 tests.
- [x] 1. TypeScript 6 -> 7 (`c145d0e8`); `api` `start`/`dev` run the compiled `dist`.
- [x] 2. Vitest 5, coverage-v8 5, unplugin-swc 2 (`192953b8`).
- [x] 3. `engines.node` `>=22.12.0`; unused root `overrides` removed (`5dd6cf29`).
- [x] 4. Core on Nest 12; handler discovery through `DiscoveryService` (`3a9435b7`).
- [x] 5. Every other package on Nest 12: correlation `83a5854f`, tenant (no Nest
  dependency), job-context `1e253cf0`, zod `a9de4f90`, casl `27f23602`, opentelemetry
  `94fadf77`, audit `d7dcb449`, cache `f536d643`, deadletter `76371236`, feature-flags
  `b3813b69`, idempotency `fdcbd9e2`, rate-limit `8789857e`, resilience `a8ff909b`.
- [x] 5.4a. `zodBadRequest` for Nest's `StandardSchemaValidationPipe` (`aee428c5`).
- [x] Release check: consumer compiled with `NodeNext` (`e0157d39`).
- [x] 6. cockatiel 4 in resilience and `api` (`180a9eb9`).
- [x] 7. rate-limiter-flexible 11 in rate-limit's dev dependencies and `api` (the commit
  after `180a9eb9`).

Remaining:

- [x] **8. NestJS 12 in `api`** (`9773aeb3`).
  - Dependencies: `@nestjs/common`, `@nestjs/core`, `@nestjs/cqrs`, `@nestjs/testing`,
    `@nestjs/platform-express`, `@nestjs/platform-fastify`.
  - The 71 transitional failures should clear. Run the discovery composition checks
    (`test/cqrs-discovery-without-private-metadata.e2e-spec.ts`,
    `pipeline-behavior-identity.spec.ts`, `behavior-composition-contracts.spec.ts`),
    `pnpm test:e2e` and `pnpm test:release`.
  - Checks: lifecycle hook order for the BullMQ worker shutdown and the other providers
    with hooks; `ConsoleLogger` treats a plain object after the message as structured
    parameters, so check the logging output; Fastify stays on 5 but the adapter's error
    mapping was reworked, so check the error responses.
  - Links: https://docs.nestjs.com/migration-guide ,
    https://github.com/nestjs/nest/releases/tag/v12.0.0
  - Verify: `pnpm --filter @nestjs-pipeline/ddd-api build`, `lint`, `test`, then
    `pnpm test:e2e`.
  - Applied: the six manifests (`^12.1.1`, cqrs `^12.1.0`); `api` and the packages
    resolve one copy each of `@nestjs/common`, `core` and `cqrs`. Nest 12 brings Fastify
    5.12.5, whose hop-count `trustProxy` trusts no proxy (and the type drops `number`):
    `createFastifyAdapter` now fails boot on a numeric `TRUST_PROXY`
    (`api/src/http-platform.ts`, two specs in `http-platform.spec.ts`, `api/README.md`
    row). Peer warnings remain only for `@nestjs/bullmq` 11 and `nestjs-pino` 4 (steps 9
    and 10.1).
  - Verified: `api` build, lint and test (903/903, the 71 failures cleared, two new
    specs); `pnpm check`, `pnpm lint`, `pnpm lint:persistence`, `pnpm test` (every
    workspace), `pnpm test:release` (19 packed packages);
    `test/pipeline-for-feature.e2e-spec.ts` (the only e2e file without containers).
    Scratch Nest 12 app shaped like `api`: both BullMQ processors close their workers
    before `MikroOrmStore` closes the ORMs, and the global pipeline module is last.
    Scratch Nest 11 vs 12 on Fastify and Express: identical replies for an unknown
    route, invalid or empty JSON, an unsupported media type and an oversized body; only
    a plain `Error` with `statusCode` changed (409 -> 500, see findings). `api` logs
    through nestjs-pino's `NativeLogger`, so the `ConsoleLogger` change does not reach
    its runtime logs.
  - `pnpm test:e2e`: 34 files, 221 tests pass.

- [x] **8a. Native schema validation in `api`** (`86c843e2`). Register `StandardSchemaValidationPipe`
  with `exceptionFactory: zodBadRequest` once as `APP_PIPE` in `AppModule`, so every
  application instance and test has it; replace the 12 `new ZodPipe(...)` parameters in
  the users, roles and auths controllers with `{ schema }`; remove `ZodPipe` from
  `@nestjs-pipeline/zod` (breaking) with its README section, JSDoc mentions and the
  architecture skill's controller rule. Verify the 400 bodies with the e2e tests.
  - Done as described; also the root README (quick start registers the pipe), the zod
    README (one "Nest Schema Validation" section, a "Migrating from 0.2.x" entry for
    step 12 to extend), the codebase map and the `createZodMapper` spec (compares with
    Nest's pipe). `users.e2e-spec.ts` now also asserts a malformed id's 400 body.
  - Verified: zod build, lint, test (151); `api` build, lint, test (903); the users,
    roles, auths and pipeline-packages e2e files (121 tests); `pnpm check`, `pnpm lint`,
    `pnpm lint:persistence`, `pnpm test`, `pnpm test:release`, `pnpm context:validate`.

- [x] **8b. One adapter-neutral error reply in the filters** (`bdf869ef`). The five package filters
  (zod, casl, feature-flags, idempotency, rate-limit) and `api`'s `DomainExceptionFilter`
  each branch on `json`/`send` for Express and Fastify; reply through Nest's
  `HttpAdapterHost` instead. Filters keep translating framework-neutral errors to HTTP;
  their registration may change (breaking). Check against the reworked Fastify mapping.
  - Done: each filter takes `@Inject(HttpAdapterHost)` and answers with
    `httpAdapter.reply` (rate-limit also `setHeader`); the per-filter response types and
    `json`/`send` branches are gone. Breaking: `new X()` no longer works; register as
    `{ provide: APP_FILTER, useClass: X }` or `new X(app.get(HttpAdapterHost))`
    (`FeatureDisabledFilter` options are its second argument). zod, casl,
    feature-flags, idempotency and rate-limit gain an `@nestjs/core` peer (`^12.0.0`).
    `api` registers the six filters as `APP_FILTER` in `AppModule`; `bootstrap.ts` and
    the e2e harness no longer list them. The explicit `@Inject` keeps injection
    independent of emitted type metadata (without it, coverage counts the metadata's
    never-taken `Object` branch).
  - Reproduced defect fixed: on Fastify, a package error thrown in Nest middleware reached
    the filter with the raw Node response; `response.status` threw inside middie and the
    process exited. `api/test/exception-filter-adapters.spec.ts` (Express and Fastify)
    fails on the old filter and passes now.
  - Verified: the five packages' build, lint, test (100% coverage); `api` build, lint,
    test (906); `pnpm test:e2e` (221); `pnpm build`, `pnpm check`, `pnpm lint`,
    `pnpm lint:persistence`, `pnpm test`, `pnpm test:release`, `pnpm context:validate`.

- [x] **8c. `errorCode` in `DomainExceptionFilter`** (evaluated, not adopted). Carry its `code` (`refresh_invalid`,
  `refresh_reused`) through Nest's `HttpExceptionOptions.errorCode` if that simplifies the
  filter; the code stays in the filter.
  - Not adopted: `errorCode` only reaches the body when an `HttpException` goes through
    Nest's default filter. The filter replies itself with `code` in one line; adopting it
    would wrap the error in an `HttpException`, delegate to the default filter, and rename
    the clients' `code` field to `errorCode`.

- [x] **9. `@nestjs/bullmq` 11 -> 12 in `api`; `bullmq` stays on 5.81** (`d4abfe5d`).
  `@nestjs/bullmq` 12 is ESM-only, needs `moduleResolution` `node16`, `nodenext` or
  `bundler` (the repo resolves with `Bundler` under TS 7) and accepts `bullmq` `^5` or `^6`.
  - `bullmq` 6 is deferred (user decision) to its own task,
    `.claude/tasks/bullmq-6-node-redis.md`: with Redis unreachable, `Worker#close()` never
    settles, so `app.close()` hangs (bullmq 6 when Redis was never reachable; bullmq 5 and
    6 when Redis goes down after the worker was ready). That task explains the bug and
    fixes it on our side before moving to `bullmq` 6 with node-redis.
  - Fixed: `reliability.module.ts` read `redisConfig()` at import time, so a second
    application in the same process (the e2e files that run Express then Fastify) dialled
    the first one's stopped Redis. BullMQ and the cache now read it in their factories;
    `bullmq-deadletter.e2e-spec.ts` covers a second application (times out before the fix).
  - Verified: `api` build, lint, test (906); `pnpm test:e2e` (222, no connection errors);
    `pnpm check`; CommonJS `require` of `@nestjs/bullmq` 12 from `dist`.

- [ ] **10. Remaining `api` runtime dependencies, one per commit.**
  - [x] 10.1 `nestjs-pino` 4 -> 5.2.1 (`f8a20706`). 5.0.0 adds Nest 12 support and
    documents that a bare `LoggerModule` import doubles request logs; 5.2.1 ships ESM
    beside CommonJS. Reproduced: `UsersModule` imported the bare `LoggerModule`, and every
    request logged `request completed` twice (532 of 532 in the e2e run). The import is
    removed; `pipeline-packages.e2e-spec.ts` asserts one `LoggerModule` instance (failed
    with two before). No peer warnings remain. Verified: `api` build, lint, test (906);
    `pnpm test:e2e` (223; each of 532 requests logged once); `pnpm check`.
    https://github.com/iamolegga/nestjs-pino/releases/tag/5.0.0
  - [x] 10.2 `@redis/client` 5 -> 6.2.1 in `api`'s dev dependencies (`6ded3d9e`).
    Its only user is `test/redis-idempotency-store.e2e-spec.ts`, which drives the
    idempotency package's `RedisIdempotencyStore`; that store uses `GET`, `SET PX NX`,
    `DEL` and an integer `EVAL`, none of which changes shape under RESP3, and it passes
    with v6's defaults (RESP3, 5000 ms command timeout). The idempotency README now says
    "tested against `@redis/client` 6". The cache's `@keyv/redis` 5.1.6 still pins
    `@redis/client` ^5, so the lockfile holds both. v6 deprecates `SET`'s flat `PX`/`NX`
    (see Open Questions). 6.3.0 is too recent for pnpm's minimum release age.
    Verified: `api` lint, test (906); `pnpm test:e2e` (223).
    https://github.com/redis/node-redis/blob/master/docs/v5-to-v6.md
  - [x] 10.3 `@libsql/client` 0.17 -> 0.18.0, moved to `api`'s dev dependencies (the
    commit after `6ded3d9e`). 0.18.0 changes only the local SQLite client: a connection pool, the
    in-memory handle kept across transactions, in-flight operations settled on close; an
    in-memory database has one connection and rejects calls while a transaction holds it
    (`TRANSACTION_ACTIVE`). MikroORM uses the native `libsql` package, not this client; its
    only user is `test/user-permission-commands.spec.ts` (file databases, no transaction),
    and `api/dist` never loads it. Verified: `api` lint, build, test (906); `pnpm test:e2e`
    (223).
    https://github.com/tursodatabase/libsql-client-ts/compare/v0.17.4...v0.18.0
  - [x] 10.4 OpenTelemetry: `sdk-node`, `exporter-trace-otlp-grpc`, `instrumentation-http`
    0.221 -> 0.222 (core packages 2.10 -> 2.11); `instrumentation-nestjs-core` 0.67 ->
    0.68; `instrumentation-pg` 0.73 -> 0.74. The lockfile holds one version of each.
    sdk-node 0.222 fails fast on errors in a declarative configuration file and in
    `startNodeSDK()`; `api` uses `new NodeSDK()`, which is unaffected: with
    `OTEL_NODE_RESOURCE_DETECTORS=all` or an unknown detector name, spans still export.
    `instrumentation-http` now redacts signed-URL query parameters (`sig`, `X-Amz-*`, ...)
    on incoming spans; no `api` controller takes query parameters. The contrib releases
    only update their `@opentelemetry/*` dependencies.
    Scratch check (`api/src/tracing.ts`'s SDK setup with an in-memory exporter, Nest
    12.1.1): Express and Fastify each give an incoming HTTP span; MikroORM 7 (ES module)
    importing `pg` gives `pg.connect`, `pg-pool.connect` and `pg.query` spans; the NestJS
    instrumentation gives none (see findings and 10.5).
    Verified: `api` build, lint, test (906); `pnpm check`. No e2e file loads
    `tracing.ts`, so `pnpm test:e2e` does not cover this step.
    https://github.com/open-telemetry/opentelemetry-js/blob/main/experimental/CHANGELOG.md
  - [ ] 10.5 `instrumentation-nestjs-core` 0.69, once published. Its Nest 12 support is
    merged (contrib#3733: version gate `<13`, and a CommonJS application's `require()` of
    the two patched internal files) and waits for release PR contrib#3719 (open,
    2026-10-01). The open contrib#3758 would instead require Node's ESM loader hook
    (`--import @opentelemetry/instrumentation/hook.mjs`) even for CommonJS applications;
    if it lands, `api`'s `start` scripts need that flag. Verify with the scratch check:
    `app_creation`, controller and handler spans, and `http.route`. A `pnpm patch` of
    0.68.0 with contrib#3733 was rejected by the owner. The improvement that drops this
    package and names HTTP spans by route is its own task,
    `.claude/tasks/http-route-tracing.md`.
  - Verify after each: `api` build, lint and test.

- [x] **11. Testcontainers 11 -> 12.2 in `api`** (`testcontainers`, `@testcontainers/redis`).
  Node 22.22 or newer; the default wait strategy uses the image healthcheck, so check every
  container started without `withWaitStrategy`.
  https://github.com/testcontainers/testcontainers-node/releases/tag/v12.0.0
  - Wait strategies: the five `postgres:16-alpine` containers set
    `Wait.forLogMessage(...)` themselves, and `RedisContainer` 12 sets
    `Wait.forLogMessage("Ready to accept connections")` (both `redis:7-alpine` uses).
    Neither image defines a healthcheck, so the new default would fall back to listening
    ports anyway. 12.1 and 12.2 add modules and fixes only.
  - Root `engines.node` stays `>=22.12.0`. Raising it to `>=22.22.0` in `16a55814` broke
    the five `package-manifest.spec.ts` files that pin each package's range to the root's
    (caught in 11a's `ddd-core` run; step 11 had run only `api` and e2e); the commit after
    `38e7e3aa` restores it. The dev requirement (Testcontainers 12 `>= 22.22`, MikroORM 7
    `>= 22.17.0`) is in `api/CLAUDE.md` instead. `@cqrs-ddd/mikro-orm` declares
    `>=22.17.0`, its MikroORM 7 peer's minimum (fixed on `master`).
  - Verified: `api` lint, test (906); `pnpm test:e2e` (34 files, 223 tests, no connection
    errors or hook timeouts); `pnpm install --frozen-lockfile`.

- [x] **11a. Align `@cqrs-ddd/core` aggregates with `@nestjs/cqrs` 12.1** (the commit after
  `84c4bee6`).
  `packages/ddd-core/domain/models/aggregate-root.ts` is a copy of the Nest 11
  `AggregateRoot`. Add the optional dispatcher context to `publish`, `publishAll` and
  `commit` and return the publisher's result (`commit` keeps handing over a copy of the
  events, then clears them); pass it through `IDomainEventPublisher.publishAll`;
  `CommandBaseHandler` passes the aggregate as the context (Nest's default). Add
  `IAggregateRoot` for the aggregate check. `WithAggregateRoot` only if a real use
  appears. No Nest dependency in `ddd-core`. Awaiting the publisher, so that a rejecting
  asynchronous publisher no longer crashes the process, was fixed on `master` and joins
  this step's change in `develop`.
  - Done: `IAggregateRoot` and `ApplyEventOptions` in
    `domain/interfaces/aggregate-root.interface.ts` (Nest's two `apply` overloads, results
    typed `unknown`); `AggregateRoot` implements it, and `publish`, `publishAll` and
    `commit` take an optional `dispatcherContext` and return the publisher's result
    (`commit` hands over a copy, clears the buffer once `publishAll` returns, keeps it if
    `publishAll` throws). `IDomainEventPublisher.publishAll(events, dispatcherContext?)`.
    `CommandBaseHandler` accepts any `IAggregateRoot` (`AggregateBearingResult`) and calls
    `publishAll(events, aggregate)`; `api`'s `PrincipalLoginService` refresh path passes
    `auth` the same way. Additive for consumers: a one-argument publisher still fits. README
    (`@cqrs-ddd/core`): entry table, publication semantics, "Using it from NestJS".
    `WithAggregateRoot` not added (no use).
  - Verified: `@cqrs-ddd/core` lint, rebuild, test (390, 100% coverage); `api` lint, test
    (906; five specs now expect the aggregate as the context); `pnpm build`, `pnpm lint`,
    `pnpm test` (every workspace), `pnpm check`, `pnpm lint:persistence`, `pnpm test:release`
    (19 packed packages), `pnpm test:e2e` (34 files, 223 tests). Scratch type check
    in `api`: Nest 12.1's `AggregateRoot` is assignable to our `IAggregateRoot`, ours to
    Nest's `IAggregateRoot`, and Nest's `EventBus` to `IDomainEventPublisher` (a broken
    object fails with TS2740). Scratch run with Nest's `EventPublisher.mergeObjectContext`
    on our `AggregateRoot`: `commit()` passes the aggregate, `commit({ transaction })` that
    context, both return the bus's result and clear the buffer.

- [x] **11b. Evaluate `@nestjs/observe`** (the `instrument` application option) for `api`'s
  HTTP and queue tracing. Command, query and event spans stay in `TraceBehavior`.
  - Not adopted. `@nestjs/observe` 0.3.5 (MIT, from the Nest team, peers `^11 || ^12`) is
    the agent of a hosted APM service: it needs an app key and secret from
    observe.nestjs.com and posts its own wire format to `https://observe-api.nestjs.com`
    (`endpoint`/`OBSERVE_ENDPOINT` move it, but it does not speak OTLP); its README calls it
    "not a replacement" for OpenTelemetry. `api` exports OTLP to a collector the operator
    chooses (`otlpConfig()`), so adopting it would add a second telemetry pipeline and a
    third-party destination for request data. Nest 12's `instrument` option itself is only
    `{ instanceDecorator }`; building our own spans on it would duplicate the NestJS
    instrumentation that 10.5 restores and `TraceBehavior`.
  - Found: `api`'s BullMQ processors do not dispatch through the `CommandBus`, so a job
    gets no span. BullMQ 5 has a `telemetry` option, and `bullmq-otel` 2.0.1 implements
    it with OpenTelemetry (see Open Questions).

- [x] **11c. Evaluate `StandardSchemaSerializerInterceptor`** only where it adds a real
  benefit after CASL projection; field authorization stays in the application layer.
  - Not adopted. The interceptor validates each object response against
    `@SerializeOptions({ schema })` and returns the schema output; a failure becomes a
    plain `Error` (500). `api`'s presentation mappers already do this after projection
    (`toResponseDto` parses `UserResponseDtoSchema`, whose fields are optional because
    projection may omit them). Moving the parse into the interceptor keeps the same
    per-response cost, adds an `async` `concatMap` step, passes `null` through instead of
    the mapper's 404, and leaves controller return types different from the body.

- [ ] **12. Documentation, release and full verification.**
  - Done first: every `@nestjs/common`, `@nestjs/core` and `@nestjs/cqrs` peer is
    `^12.1.0` (20 ranges in 13 manifests); the requirement lines that state it (audit,
    cache, casl, opentelemetry, zod, core and the root README's Quick Start) follow, and
    zod's stale "NestJS 11" peer note is corrected. Verified: `pnpm test` (every
    workspace), `pnpm test:release` (19 packages, no peer warnings), `pnpm check`.
  - Done: every package, the root and `api` at 0.3.0 (21 manifests); requirement lines
    say Node.js 22.12 and `@nestjs-pipeline/core` `^0.3.0` (12 package READMEs; the
    "Migrating from 0.1.x" sections keep their 0.2.0 wording); the root README's version
    summary, contents and "Upgrading from 0.2.x" (seven points); zod's "Migrating from
    0.2.x" opens with peers and runtime; `CHANGELOG.md` 0.3.0 (requirements, breaking,
    added, changed); the map's Gotchas gain five NestJS 12 entries. The root README's 0.1.x
    snippet and the filter registration came with 0.2.2.
  - Verified: on the squashed code `pnpm verify:all` (type checks, 3,050 unit
    tests in 20 workspaces, build, `test:release`, e2e 34 files / 223 tests), `pnpm build`,
    `pnpm check`, `pnpm lint:persistence`, `pnpm context:validate`; after the versions and
    docs, `pnpm test` (every workspace) and `pnpm test:release` (19 packages packed at
    0.3.0). Not done: tags and npm publishing (owner).
  - `CHANGELOG.md` 0.3.0 entry and a root `README.md` upgrade section: Nest 12 peers,
    Node 22.12, `@Optional()` in subclasses (see Tests and Verification), cockatiel
    `^4.0.0`, rate-limiter-flexible v10+ requiring `points` and `duration`, `ZodPipe`
    replaced by the `schema` option, filter registration (8b), `IAggregateRoot` and the
    dispatcher context of `AggregateRoot` and `IDomainEventPublisher` (11a), and that a CommonJS
    application compiling with TypeScript `module: node16` must move to `nodenext` (or
    `node20`) to import the Nest 12 ES modules. The filters' new registration and the
    `@nestjs/core` peer of zod, casl, feature-flags, idempotency and rate-limit (8b); the
    root README's 0.1 -> 0.2 note still shows `new UnauthorizedActionFilter()`. Without `IdempotencyConflictFilter`,
    Nest 12 answers an `IdempotencyConflictError` with 500 instead of 409/422.
  - Requirement lines still saying Node.js 22 (all package READMEs) and the
    `@nestjs-pipeline/core` `^0.2.0` mentions; bump versions to 0.3.0.
  - Run `pnpm install`, `pnpm build`, `pnpm check`, `pnpm lint:persistence`,
    `pnpm verify:all`; `pnpm context:update`, review the map's Critical Modules and
    Gotchas, `pnpm context:validate`.

## Decisions

- Stay on CommonJS. Nest 12 and cockatiel 4 ship ES modules; CommonJS loads them through
  Node's `require()` of ES modules (Node >= 22.12). The move to ES modules is
  `.claude/tasks/esm-migration.md` (0.4.0).
- Handler discovery (`packages/pipeline/src/services/handler-discovery.ts`): Nest's
  `DiscoveryService` plus the metadata key each public CQRS handler decorator records,
  learned from a throwaway class; bootstrap fails unless each records exactly one key.
  Chosen over CQRS's own `ExplorerService` instance, bus `register()` interception, a path
  import and literal keys: runtime cost is identical for all, and this is the only one on
  public APIs that fails loudly.
- `api` runs from the compiled `dist` (`ts-node` cannot run on TS 7; `tsx` emits no
  decorator metadata).
- Nest 12 only; dev ranges `^12.1.1`. Peers `^12.1.0` (owner decision, 2026-10-01): 12.0.x
  drops `@Optional()` markers in a subclass without its own constructor, and only 12.1 is
  tested.
- One package per commit, accepting that `api` tests fail from step 4 until step 8.
- Resilience requires cockatiel `^4.0.0`. Rate-limit keeps no rate-limiter-flexible peer
  (the limiter is typed structurally); dev and `api` use `^11.2.1`.
- Simplify with Nest 12 wherever functionality is kept or extended, breaking changes
  included, but never at the cost of the DDD/CQRS responsibilities: no HTTP exceptions
  from domain or application code, no Nest `AggregateRoot`/`EventPublisher` in the domain
  (align our copy instead), no response serializer in place of CASL projection, no
  HTTP-only validation in place of the pipeline's command validation.
- Runtime performance outranks bootstrap cost when choosing between designs.
- `bullmq` stays on 5; `bullmq` 6 with node-redis and the worker shutdown hang are the task
  `.claude/tasks/bullmq-6-node-redis.md`.

## Modified Files

Recorded per commit (see the Plan). Beyond the manifests and `pnpm-lock.yaml`: step 1
changed `api`'s run scripts; step 4 added `handler-discovery.ts`, injected
`DiscoveryService` into `PipelineBootstrapService`, imported `DiscoveryModule` in
`PipelineModule` and rewrote the five bootstrap specs' discovery mocks; 5.4a added
`packages/pipeline-zod/src/pipes/zod-bad-request.ts`; the release fix changed
`integration/packages/consumer/tsconfig.json`; the READMEs, `packages/pipeline/CLAUDE.md`,
the architecture skill and `.claude/codebase-map.md` follow each change.

## Tests and Verification

State after step 7 (Node 24.13.0, pnpm 11.18.0; step 8 results are in the Plan): `pnpm build`, `pnpm lint`,
`pnpm check`, `pnpm lint:persistence`, `pnpm context:check`, `pnpm context:validate` and
`pnpm test:release` (19 packed packages) pass. `pnpm test`: all 19 packages pass at 100%
coverage; `api` fails 71 of 901 tests in 17 files, all from mixing Nest 11 (`api`) with
Nest 12 (the packages): "Nest can't resolve dependencies of the PipelineBootstrapService
(?, ...)" and, in three mapper specs, "expected error to be instance of
BadRequestException". Last e2e run (step 2, Nest 11): 34 files, 221 tests.

Findings to reuse:

- `@nestjs/cqrs` 12 is ESM with an `exports` map of `.` only; no metadata constants,
  `ExplorerService` or other discovery API at the root. `@nestjs/common` and
  `@nestjs/core` 12 export `./*`, so deep paths such as
  `@nestjs/core/injector/instance-wrapper` and `@nestjs/common/constants` still resolve.
- Lifecycle: module hook order by distance is unchanged from 11 (global modules first on
  bootstrap, last on shutdown); only the order inside a module is new (by dependency
  level). All `onModuleInit` hooks run before any `onApplicationBootstrap`.
- `@Optional()`: `@nestjs/core` 12.0.0 to 12.0.4 never let a subclass inherit the markers;
  from 12.1.0 a subclass without its own constructor inherits them, and one that declares a
  constructor must repeat them. Every class in the repository declares its own.
- `ArgumentMetadata<Metatype = any>` gained an optional `schema`; `PipeTransform` is
  unchanged. `StandardSchemaValidationPipe` returns the schema output and awaits async
  refinements and transforms.
- CQRS publishers' `publish()` is not awaited, so a publisher cannot wrap a handler.
- TypeScript: a CommonJS file compiled with `module: Node16` cannot statically import an
  ES module (TS1479); `NodeNext` allows it.
- Nest 12's `BaseExceptionFilter` maps a non-Nest error to its `statusCode` only for a
  `FastifyError`, an `http-errors` error or a plain non-`Error` object; any other `Error`
  carrying `statusCode` becomes 500 (Nest 11 used its status). Only
  `IdempotencyConflictError` has that shape here, and its filter maps it.
- `@nestjs/platform-fastify` 12.1.1 bundles Fastify 5.12.5: a numeric `trustProxy` means
  "trust no proxy" (hop counts cannot validate the peer); use `true`, an address list or
  a function. Express 5 still honours hop counts.
- Redis clients: `@nestjs/bullmq` passes `connection` to BullMQ and has no client of its
  own. BullMQ 6 supports `ioredis` (options objects create one), node-redis (pass a
  client) and a PostgreSQL backend. The `ioredis` README: "maintenance is done on a
  best-effort basis ... For new projects, node-redis is the recommended client library."
  `@keyv/redis` (the cache) already uses `@redis/client`.
- `@opentelemetry/instrumentation-nestjs-core` up to 0.68 patches only `@nestjs/core`
  `>=4.0.0 <12`, and on Nest 12 its hook never sees the two internal files it patches
  (they load as ES modules). Since step 8, `api` has had no NestJS spans and no
  `http.route`; nothing fails or logs. No test loads `api/src/tracing.ts`, which is why
  step 8 did not catch it. HTTP and pg spans are unaffected.
- Defects that already existed on `master`: the three fixed here (steps 8b, 9 and 10.1,
  released on `master` as 0.2.2), and four fixed on `master` afterwards and carried into
  0.3.0 (an asynchronous publisher's rejection, the duplicated log context, the tenant
  settings read at import time, `@cqrs-ddd/mikro-orm`'s Node range). Verified on both
  branches with `pnpm verify:all` (e2e 35 files, 224 tests).

## Risks

- From step 4 until step 8, `api` loads the packages on Nest 12 beside its own Nest 11, so
  its tests that start a Nest application, or compare Nest exception classes, fail.
- Raising the Nest and cockatiel peers is breaking for consumers (0.3.0).
- TypeScript 7 has no programmatic API until 7.1; a tool that imports `typescript` as a
  library may fail.
- Redis RESP3 by default can change reply shapes in the Redis-backed stores (10.2).

## Open Questions

- Trace BullMQ jobs with BullMQ's `telemetry` option and `bullmq-otel` (11b finding), as
  its own task?
- `RedisIdempotencyStore` sends `SET` with the flat `PX`/`NX` options, which node-redis 6
  deprecates for `expiration`/`condition`. Moving to the new form drops node-redis 4, which
  the idempotency README still names as supported; decide before node-redis removes them.

## Next Steps

1. Step 12; 10.5 once `instrumentation-nestjs-core` 0.69 is published.
2. Step 12 (release 0.3.0); then `.claude/tasks/esm-migration.md` (0.4.0).

## Snapshot Impact

Yes: dependencies, the toolchain and the pipeline bootstrap change. Covered in step 12.

## Last Updated

2026-10-01
