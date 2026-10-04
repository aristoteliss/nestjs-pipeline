# Task Context

## Task

Make nestjs-pipeline the complete NestJS example of the `@cqrs-ddd` packages built in
`~/Source/ddd-cqrs`: from 0.5.0 the NestJS `api` keeps all of NestJS and official
`@nestjs/cqrs` and installs `@cqrs-ddd/*` only for what NestJS lacks; the `@nestjs-pipeline/*` packages stop at
0.4.x, stay on npm with every version, and every README points to the new packages.
Everything is tried against a local registry before anything is published (owner,
2026-10-01 to 2026-10-04).

## Goal

- `api` builds and passes `pnpm verify:all` and `pnpm test:e2e` on `@cqrs-ddd/*` 0.5.0,
  installed first from the local registry, then from npm once they are published.
- `api` stays an ordinary NestJS application: `CqrsModule`, `CommandBus`, `QueryBus`,
  `EventBus`, `@CommandHandler`, `@QueryHandler`, `@EventsHandler`, `EventPublisher`,
  modules, dependency injection and controllers are NestJS's; the packages add the pipeline
  behaviors and the DDD building blocks and replace nothing (owner, 2026-10-04). Using the
  packages without NestJS is ddd-cqrs's, not this repository's.
- The `@nestjs-pipeline/*` packages keep every published version (0.1 to 0.4) on npm;
  nothing is unpublished or deprecated.
- Every README of this repository (root, each package, the documentation site's home
  page), and the npm page of every `@nestjs-pipeline/*` package, says the work continues
  from 0.5.0 as `@cqrs-ddd/*`, with links to npm, https://github.com/aristoteliss/ddd-cqrs
  and https://aristoteliss.github.io/ddd-cqrs/.

## Scope

In: `api/`, the READMEs of the root and of `packages/*`, the documentation site's home
page, the `packages/*` versions for the README-only release, CHANGELOG, the context files.

Out: behavior changes in the packages of this repository (they stay at their 0.4.x code);
changes to the `@cqrs-ddd` packages, which are made in `~/Source/ddd-cqrs` and
republished to the local registry; publishing, which is the owner's.

## Current Status

In progress. The `@cqrs-ddd` packages are complete and verified in ddd-cqrs; all 20 are
published at 0.5.0 on the local registry (2026-10-04). This repository is no longer frozen
for this task (owner, 2026-10-04).

Where the work stopped (2026-10-04): the plan was revised with the owner. `api` stays a
complete NestJS application on official `@nestjs/cqrs`, the packages only add
functionality, the glue lives in `api` and each `api` module registers the behaviors it
configures (Phase 1.3). `AGENTS.md`, `CLAUDE.md` and this file were updated for it, and
ddd-cqrs's `.claude/tasks/cqrs-ddd-pipeline.md` (Task, Goal, Scope); committed with the owner's
agreement: here `d0a98a71`, in ddd-cqrs `c55e680`. The local registry answers on
`http://127.0.0.1:4873/`. Phases 0 to 2 and 3.2 are done and committed; next: the owner's publish (3.1).

## Plan

### Phase 0: setup

- [x] 0.1 Local registry (ddd-cqrs, 2026-10-04): Verdaccio in Docker,
  `~/Source/ddd-cqrs/tools/local-registry/` (`compose.yaml`, `config.yaml`, and a README
  with every command), on `http://127.0.0.1:4873/`. `@cqrs-ddd/*` is served only from it
  and never reaches npm; `@nestjs-pipeline/*` and every other package are proxied from
  npmjs.org, so their published versions still resolve. Start it with
  `docker compose -f ~/Source/ddd-cqrs/tools/local-registry/compose.yaml up -d`.
- [x] 0.2 All 20 `@cqrs-ddd` packages published there at 0.5.0 (`next`, and `latest`
  because it is their first version there).
- [x] 0.3 A branch here from `develop` (for example `adopt-cqrs-ddd`); commits only after
  the owner agrees, never on `master`. Done 2026-10-04: branch `adopt-cqrs-ddd`, created
  from `develop` at `0caf5535`; the revised plan is its first commit, `d0a98a71`
  (ddd-cqrs's matching task edit: `c55e680` on its `develop`).

### Phase 1: `api` 0.5.0 on the `@cqrs-ddd` packages

- [x] 1.1 Point `api` at the local registry during the trial without committing it. Done
  2026-10-04: pnpm reads `.npmrc` only at the workspace root (committed), so an `api/.npmrc`
  would be ignored; instead `~/.npmrc-cqrs-local` (outside the repository) holds only
  `@cqrs-ddd:registry=http://127.0.0.1:4873/`, and installs run as
  `NPM_CONFIG_USERCONFIG=$HOME/.npmrc-cqrs-local pnpm install`. The lockfile records no
  localhost URL (checked).
- [x] 1.2 Dependencies and imports. Done 2026-10-04 (uncommitted): in `api/package.json` the
  14 `@nestjs-pipeline/*` workspace dependencies became their `@cqrs-ddd/pipeline*`
  successors at `^0.5.0`; `@cqrs-ddd/core`, `mikro-orm`, `safe-stringify` and `uuidv7` went
  from `workspace:*` to `^0.5.0`; the five `@mikro-orm/*` ranges went from `^7.2.1` to
  `^7.2.3`, the peer `@cqrs-ddd/mikro-orm` 0.5.0 requires (7.2.1 was installed). The install
  added the 19 new `@cqrs-ddd` versions to `minimumReleaseAgeExclude` in
  `pnpm-workspace.yaml` (pnpm's age gate; ask the owner before committing it). One copy of
  each stateful package resolves (`pipeline`, `pipeline-tenant`, `pipeline-correlation`,
  `pipeline-job-context`, `core`, all 0.5.0); the remaining peer warnings (TypeScript 7 vs
  `@nestjs/swagger`, `@emnapi`) predate this change. A one-off script (scratch, not
  committed) rewrote every `@nestjs-pipeline/<name>` in `api/src` and `api/test` to its
  successor: 141 files of imports, `vi.mock` names and test titles, then 7 files of comments
  (`@nestjs-pipeline/ddd-api`, the package's own name, kept).
  `tsc --noEmit` on `api` then reports 80 errors, all NestJS glue that 1.3 replaces:
  `CACHE_TOKEN` (18, core has no DI tokens: the 16 repositories and
  `persistence.module.ts`), `PipelineModule` (14), `DeadLetterModule` (6), `AuditModule`
  (4), `PIPELINE_BEHAVIORS_OPTIONS_METADATA` (4, test support), `CacheModule` (3),
  `ResilienceModule`, `RateLimitModule`, `FeatureFlagsModule`, `CaslModule` (2 each),
  `JobContextModule`, `IdempotencyModule`, `zodBadRequest`, `HttpCorrelationMiddleware`,
  `LOGGING_BEHAVIOR_LOGGER`, `PipelineModuleFeatureOptions`, `PIPELINE_CACHE` (1 each), the
  package exception filters in `app.module.ts` and their specs, `RATE_LIMITER`,
  `PIPELINE_BEHAVIORS_METADATA` (test support), `CASL_PERMISSION_SOURCE`, and two
  implicit-`any` spec parameters.
- [x] 1.2a The NestJS way where `api` stood in for NestJS (owner, 2026-10-04: "remove my
  code that replaces NestJS code; use the packages only for what NestJS lacks; if
  something we need is missing from NestJS, stop and tell me"). Done 2026-10-04
  (uncommitted):
  - the 8 command handlers no longer extend core's `CommandBaseHandler`: they implement
    `ICommandHandler<C, R>` with `execute()`, inject NestJS's `EventPublisher`, and end
    with `await this.publisher.mergeObjectContext(aggregate).commit()` after saving;
    `PrincipalLoginService` refresh does the same instead of `eventBus.publishAll` +
    `uncommit()`. Core's aggregates implement NestJS 12's `IAggregateRoot`, which
    `mergeObjectContext` takes, so no cast is needed;
  - specs pass `new EventPublisher(fakeBus)` and call `execute()`; NestJS's publisher
    hands `publishAll` a third argument (`asyncContext`, `undefined` here) and its
    `commit()` publishes an empty list when nothing happened (a refresh grace answer), so
    those assertions changed;
  - `AGENTS.md` rule 8, the architecture skill (section 6 and checklists), the map's
    architecture section and the two `api/README.md` handler examples describe
    `EventPublisher` instead of `CommandBaseHandler`;
  - kept, because NestJS has no equivalent: `RootEntity`/`RootDomainEvent` and the rest of
    core's domain and persistence building blocks; `BaseCommand`/`BaseQuery` with
    `createCommand`/`createQuery` (payload without session metadata, stable fingerprints,
    `getUpdateFields`); a class cannot extend both them and NestJS's `Command<R>`, and
    `api` does not use `Command<R>` (controllers type `execute<C, R>()`);
  - already the NestJS way: `@EventsHandler` event handlers, `@nestjs/bullmq` processors,
    `StandardSchemaValidationPipe`, guards, interceptors and filters, `nestjs-pino`;
  - shutdown (owner, 2026-10-04): `src/graceful-shutdown.ts` and its spec removed;
    `bootstrap.ts` calls `app.enableShutdownHooks()` on the new root `ServerModule`
    (`src/server.module.ts`), which imports a `@Global()` `TracingModule` before
    `AppModule`. NestJS shuts global modules down last, and the first registered of them
    last of all, so its `onApplicationShutdown` flushes telemetry after every other hook,
    as before (`server.module.spec.ts` pins the order and fails with the import order
    swapped). Differences NestJS brings: a second signal during shutdown is ignored
    instead of terminating at once, and a failing hook ends with `process.exit(1)`
    without the flush. `api/CLAUDE.md` and `bullmq-6-node-redis.md` (its planned shutdown
    deadline needs code NestJS lacks: ask the owner) were updated;
  - verified: `tsc` back to the glue errors only; the auth, user and role command specs
    and `principal-login.service.spec.ts` pass (22 + 28 tests); the specs still failing
    fail on old-module glue (1.3).
- [x] 1.3 The glue, in `api` only and kept small (owner, 2026-10-04: "very small, near zero
  change, as a Nest project"):
  - **each `api` module registers the behaviors it configures** (owner, 2026-10-04): a
    factory provider under the behavior class, built with `new` and the options the old
    package modules received today, in the module that owns that configuration
    (`ObservabilityModule`: logging, trace, metrics, attributes, Zod, audit;
    `ReliabilityModule`: dead letter, rate limit, idempotency, resilience, cache, feature
    flags; the authorization module: CASL), for example
    `{ provide: IdempotencyBehavior, inject: [NativeLogger], useFactory: (log) => new
    IdempotencyBehavior(new MemoryIdempotencyStore(), undefined, log) }`, exported, with
    that module's shutdown hook for what it opened (`store.destroy()`,
    `cache.disconnect()`, `releaseFeatureFlagProvider()`);
  - the root never builds a behavior: for every behavior class in a handler's plan the
    bootstrap takes the instance a module registered (`moduleRef.get(Class, { strict:
    false })`); a placed class no module registers fails startup naming the class and the
    handler, and a class registered by two modules fails startup naming both (a
    `DiscoveryService` scan). This avoids the bug found in the old plugin (trial of
    2026-10-01, recorded in ddd-cqrs's task history, commit `12a06e7`): `PipelineModule`
    built its own copy of a behavior placed in `globalBehaviors` without constructor
    arguments, and with the providing module imported before `PipelineModule.forRoot()` the
    handler failed at its first call, while the other import order worked;
  - a bootstrap provider that finds every `@nestjs/cqrs` handler with NestJS's public
    `DiscoveryService` and the metadata `@nestjs/cqrs` exports
    (`COMMAND_HANDLER_METADATA`, `QUERY_HANDLER_METADATA`, `EVENTS_HANDLER_METADATA`),
    reads its `@UsePipeline`/`@SkipPipeline` with `pipelineOf()`, compiles its plan with
    `compilePipelinePlan`, validates contracts with `validateBehaviorContracts` (failing
    startup in strict mode), and wraps that application's singleton handler instance with
    `createPipelineRunner` (never the shared prototype), unwrapping it on shutdown;
  - one exception filter answering with each package's `toHttpResponse(error)` and core's
    `domainErrorHttpStatus`, replacing the six package filters.
  Done 2026-10-04 (uncommitted):
  - `src/common/pipeline/`: `PipelineModule.forRoot({ globalBehaviors, sources,
    diagnostics })` and `PipelineBootstrap`. The handler metadata keys of `@nestjs/cqrs`
    12.1 are not exported, so each public handler decorator is applied to a throwaway
    class to read its key (as the old plugin did). Behavior instances are read from the
    one provider whose token is the behavior class (`DiscoveryService`), not through
    `moduleRef.get`;
  - `ObservabilityModule` places the global behaviors and provides logging (on
    `NativeLogger`), trace, metrics, attributes, Zod and audit (`LogAuditSink` on a Nest
    `Logger`); `ReliabilityModule` provides dead letter, rate limit (`RATE_LIMITER`, shared
    with the session refresh), idempotency (`MemoryIdempotencyStore`), resilience,
    response cache (`RESPONSE_CACHE`, `buildCache`) and feature flags, and closes the
    store, cache and flag provider in its `onApplicationShutdown`; `AuthorizationModule`
    (now `@Global`, like the old `CaslModule`) provides `CaslBehavior` and
    `CaslAuthorizer`. Behaviors log through `new Logger(Behavior.name)`;
  - `PipelineErrorFilter` (`src/common/filters/`) replaces the five package filters with
    each package's `toHttpResponse`; `zodBadRequest` moved to
    `src/common/validation/zod-bad-request.ts` (NestJS pipe glue, no successor package);
    `CACHE` (`src/persistence/cache/cache.token.ts`) replaces core's `CACHE_TOKEN`;
    `httpCorrelation()` replaces `HttpCorrelationMiddleware`; `JobContextRegistration`
    (`src/common/context/`) replaces `JobContextModule`;
  - specs: the ones that composed the old modules now compose `api`'s `PipelineModule`
    with behavior providers; `pipeline-bootstrap-regressions.spec.ts` was rewritten for
    the new guarantees (restore on failed start and on close, class prototypes never
    patched, request-scoped handlers and behaviors refused);
    `pipeline-behavior-identity.spec.ts` gained "two modules provide the same behavior"
    (fails, naming both); `pipeline-for-feature.e2e-spec.ts` became
    `behavior-module-registration.e2e-spec.ts`; the mapper specs expect
    `ZodValidationError`, which 0.5.0's `createZodMapper` throws (answered 400 by
    `PipelineErrorFilter` with `{ statusCode, error, message, details }`; controller DTOs
    still fail first in NestJS's pipe with `{ formErrors, fieldErrors }`);
    `test/lint/biome-general-plugins.spec.ts` restored (the 1.2 rewrite had changed its
    fixture strings, which test rules for the frozen `packages/*`).
  `@nestjs/cqrs` dispatches as today and reads the method at call time, so the wrapped
  method is what runs: `instance.execute(command|query)` for command and query handlers
  (`command-bus.js:78`, `query-bus.js:75` of `@nestjs/cqrs` 12.1.0) and
  `handler.instance.handle(event)` for event handlers (`event-bus.js:110`). The bootstrap
  therefore wraps `execute` on command and query handlers and `handle` on event handlers;
  `api` has two event handlers (`UserCreatedHandler`, `UserUpdatedHandler`, both
  `@UsePipeline(deadLetter({ rethrow: false }))`), and `DeadLetterBehavior` is also scoped
  to events globally, so the event path is part of the glue, not an afterthought.
- [x] 1.4 The two request-scoped handlers (`UpdateUserHandler`, `UpdateRoleHandler`) and
  `CaslPermissionSource` become singletons (they read the principal from
  `AsyncLocalStorage`); the bootstrap refuses a request-scoped handler that declares a
  pipeline, with a message saying why: for a request-scoped handler `@nestjs/cqrs`
  resolves a new instance on every call (`command-bus.js:92`, `query-bus.js:84`,
  `event-bus.js:117`), so a wrapped singleton instance would never run. NestJS request
  scope itself stays available to every other provider of `api`. A side gain: the CASL
  chain is no longer resolved through `moduleRef.resolve()` on every request. Done
  2026-10-04 (uncommitted).
- [x] 1.5 Verify: `api` lint and unit tests, then `pnpm test:e2e` (Docker). 2026-10-04:
  `api` typecheck clean, `pnpm exec biome check api` clean (360 files),
  `pnpm lint:persistence` clean, `pnpm --filter @nestjs-pipeline/ddd-api test` 113 files /
  911 tests passed; `pnpm test:e2e` 35 files / 224 tests passed (the pinned 400 bodies
  included, so no route reaches a mapper-only rule). Checked in particular
  the pipeline composition, identity, bootstrap, context-source, skip, span-attribute,
  cache-partitioning and job-context suites, and the cases behind the guards of the
  2026-10-04 answer: no behavior runs twice, tenant and correlation ids reach handlers,
  event handlers and jobs, the event handlers' dead-letter path, and shutdown closes the
  memory-store timer, the Redis cache connection and the feature-flag provider.
- [ ] 1.6 Each failure caused by a `@cqrs-ddd` package is fixed in ddd-cqrs, the version
  removed from the local registry
  (`npm unpublish @cqrs-ddd/<name>@0.5.0 --force --registry http://127.0.0.1:4873/`),
  republished, reinstalled here, and recorded under Decisions with its fix.

- [x] 1.7 The NestJS adapter package (owner, 2026-10-04, reversing "no plugin"; moved to
  ddd-cqrs the same day, with one exception to its rule 1): `@cqrs-ddd/nestjs` 0.5.0 is
  built, tested and published from `~/Source/ddd-cqrs/packages/nestjs`, and installed here
  from the local registry (`^0.5.0`): `PipelineModule`/`PipelineBootstrap`, `ErrorFilter` +
  `toHttpException`/`httpAnswer` (every `@cqrs-ddd` error becomes a NestJS `HttpException`
  with Nest's body, package extras kept; a `ZodValidationError` answers like NestJS's
  validation pipe; package errors are matched by name, so a second, bundled copy of a
  package still converts), `./correlation`, `./job-context`. Peers: NestJS 12,
  `@cqrs-ddd/pipeline` and `core` required, the behavior packages optional (their `/http`
  mappings loaded with `require` when installed; no top-level `await`, so CommonJS apps
  load it). `packages/cqrs-ddd` here = `@nestjs-pipeline/cqrs-ddd` 0.5.0, a facade that
  depends on `@cqrs-ddd/nestjs` `^0.5.0`, declares its peers and re-exports every entry.
  `api`: `DomainExceptionFilter` extends `ErrorFilter` as the one global filter; NestJS's
  default `StandardSchemaValidationPipe`; every 400 answers with NestJS's body.
  `pnpm test:release` runs per release line (owner, 2026-10-04: the 0.4.x packages stay
  releasable for fixes): `release.mjs 0.4` unchanged; `release.mjs 0.5` packs the facade,
  installs its optional peers and runs `integration/packages/consumer/src-0.5/smoke.ts`;
  the 0.4-only rule "no `@nestjs-pipeline/*` manifest names `@cqrs-ddd/core`" applies to
  the 0.4 line. `packages/pipeline/src/package-boundaries.spec.ts` reads the 0.4.x
  manifests only. Verified 2026-10-04: ddd-cqrs `pnpm test` (23 workspaces), `pnpm lint`,
  Biome, Grit, `pnpm test:release` (21 packages, the adapter installed alone with every
  entry point) passed; adapter 32 tests, 100% coverage; published to the local registry
  (user `claude-local`, token in `~/.npmrc-local`, outside both repositories). Here:
  `pnpm -r test` (21 workspaces), `api` e2e 224/224, `pnpm lint`, Biome, Grit,
  `pnpm test:release` (both lines) passed, installed with
  `NPM_CONFIG_USERCONFIG=$HOME/.npmrc-cqrs-local`. `pnpm-workspace.yaml` gained
  `@cqrs-ddd/nestjs@0.5.0` in `minimumReleaseAgeExclude` (still uncommitted, owner's call).

### Phase 2: README notices and the 0.4.3 release

- [x] 2.1 A notice at the top of the root README, of every `packages/*/README.md` and of
  the documentation site's home page: the package continues from 0.5.0 as its successor
  (table below), with the successor's npm page, the ddd-cqrs GitHub repository and the
  ddd-cqrs documentation site; versions 0.1 to 0.4 stay on npm unchanged. No
  `npm deprecate`: the README notice alone carries the redirect (owner, 2026-10-04).
- [x] 2.2 Bump the 14 `@nestjs-pipeline/*` packages to 0.4.3, a README-only release (the
  code does not change), with a CHANGELOG entry saying so. An npm page shows the README of
  the latest version, so the notice reaches npm only through a new version.
- [x] 2.3 The five `@cqrs-ddd/*` copies here (`ddd-core` as `@cqrs-ddd/core`,
  `ddd-mikro-orm`, `safe-stringify`, `untyped`, `uuidv7`) get the notice in their READMEs
  on GitHub but are never published from this repository again: ddd-cqrs publishes those
  names from 0.5.0, and its README replaces theirs on npm.
- [x] 2.4 Try the notices on the local registry: publish the 0.4.3 releases there, check
  that `npm view @nestjs-pipeline/<name> readme --registry http://127.0.0.1:4873/` shows
  the notice, that 0.4.3 installs, and that 0.1 to 0.4.2 are still listed.

  Done 2026-10-04 (2.1 to 2.4): a notice under the title of every package README (the 14
  name their successor, its npm page, ddd-cqrs and its docs page, and say 0.4.x receives
  fixes only; the five `@cqrs-ddd/*` copies say they are published from ddd-cqrs from
  0.5.0), of the root README, and a banner on the docs home page; the 14 packages at
  0.4.3, CHANGELOG entry (synced to the docs changelog). Published to the local registry
  only: every 0.4.3 README carries the notice, each package lists its versions from 0.1 to
  0.4.3, `@nestjs-pipeline/tenant@0.4.3` installs and loads, peer ranges read `^0.4.3`.

### Phase 3: hand over and close

- [ ] 3.1 Order for the owner: publish `@cqrs-ddd` 0.5.0 from ddd-cqrs (its release task,
  step 8.3), so every link resolves; push this repository's branch; publish the 0.4.3
  notice releases of the 14 `@nestjs-pipeline/*` packages; switch `api` to the npm
  packages and rerun its suites.
- [x] 3.2 Context files (`AGENTS.md`, `CLAUDE.md`, nested `CLAUDE.md` files, the
  architecture skill, `.claude/codebase-map.md`) describe the new shape; `pnpm
  context:update`, `pnpm context:validate`. Done 2026-10-04: `AGENTS.md`, `CLAUDE.md`,
  `packages/CLAUDE.md`, `api/CLAUDE.md`, `api/README.md`, the skill and the map's manual
  sections describe `api` on `@cqrs-ddd/*` and `@cqrs-ddd/nestjs`, and `packages/*` as the
  0.4.x line plus the facade; `pnpm context:validate` 58/58. Verified afterwards:
  `pnpm -r test`, `pnpm test:release` (both lines), `pnpm docs:build` passed.
- [ ] 3.3 Move what lasts to its owners and delete this file.

Successor of each package:

| Here (`@nestjs-pipeline/`) | Continues as (`@cqrs-ddd/`) |
| --- | --- |
| `core` | `pipeline` (the engine, `@UsePipeline`, `@SkipPipeline`, `pipelineOf`); its NestJS wiring has no successor package and lives in `api` (1.3) |
| `audit`, `cache`, `casl`, `correlation`, `deadletter`, `feature-flags`, `idempotency`, `job-context`, `opentelemetry`, `rate-limit`, `resilience`, `tenant`, `zod` | `pipeline-<same name>` |
| `ddd-core`, `ddd-mikro-orm`, `safe-stringify`, `untyped`, `uuidv7` (already `@cqrs-ddd/*` names) | the same names, from 0.5.0 in ddd-cqrs |

## State of ddd-cqrs (2026-10-04)

- Branch `develop`, ahead of `origin/develop`; `master` can fast-forward to it. Nothing
  of 0.5.0 is on npm yet: npm has `@cqrs-ddd/core`, `mikro-orm`, `uuidv7`,
  `safe-stringify` and `untyped` up to 0.4.2 (published from this repository) and none of
  the other 15.
- Its release task, `~/Source/ddd-cqrs/.claude/tasks/cqrs-ddd-pipeline.md`, step 8.3, holds
  the owner's publish commands, run from a clean checkout of ddd-cqrs once this task's
  Phase 1 passes: `git push origin develop`, `git checkout master`,
  `git merge --ff-only develop`, `git push origin master`, `pnpm install
  --frozen-lockfile`, `pnpm verify:all`, `npm whoami`, `pnpm publish:all --tag next`.
  Step 8.4 then installs the published packages in a scratch project.
- Changes made there before publishing, which this migration must follow: the pipeline
  declarations moved to `@cqrs-ddd/pipeline`; the unused `@nestjs/cqrs` copies were
  removed from `@cqrs-ddd/cqrs`; `httpCorrelation()` replaced `HttpCorrelationMiddleware`;
  the OpenTelemetry default scope name changed; `CACHE_TOKEN` left core (details below).
- Its `api/` serves the users, roles and sessions endpoints of this repository's `api` on
  Express and Fastify, with the same statuses and bodies where this repository's tests pin
  them; its tests are the ported suites of this `api`, placed by what they test
  (`src/**` next to the module, `test/application`, `test/e2e`). It is the model for
  Phase 1.
- Its `integration/` holds small applications that each use one package family
  (`payments/`, `library/`, `inventory/`, `profiles/`, `members/`), useful as examples of
  each package used alone.
- Open in ddd-cqrs, not blocking this task: Q6 (a combined HTTP error mapper in a package,
  or each application's own) and Q7 (dead-letter redrive for plain functions).

## API facts of `@cqrs-ddd` 0.5.0 for the migration

- `@UsePipeline`, `@SkipPipeline` and `pipelineOf()` are in `@cqrs-ddd/pipeline`; they
  work in both TypeScript decorator modes and store their declaration under well-known
  symbols, not `Reflect` metadata.
- `@cqrs-ddd/cqrs` (framework-free buses) is not used here: `api` keeps `@nestjs/cqrs`.
- The engine pieces the glue uses are exported by `@cqrs-ddd/pipeline`:
  `compilePipelinePlan`, `createPipelineRunner`, `validateBehaviorContracts`,
  `pipelineOf`, `getBehaviorId`, `PipelineConfigurationError`.
- Behaviors are plain classes with constructor defaults (`new AuditBehavior(sink)`); one
  instance per behavior class. Entry helpers (`audit()`, `cache()`,
  `idempotent()`, `requires()`, …) build the `[Behavior, options]` entries.
- Errors with an HTTP meaning are answered by `toHttpResponse(error)` from the `/http`
  entry point of `pipeline-zod`, `-casl`, `-idempotency`, `-rate-limit` and
  `-feature-flags`; `createZodMapper` throws `ZodValidationError`.
- `@cqrs-ddd/pipeline-correlation`: `httpCorrelation(options)` returns an
  `(req, res, next)` middleware; only the `grpc()` preset of `CorrelationFrom` exists
  (the `amqp`, `kafka` and `nats` presets were NestJS microservice contexts).
- `@cqrs-ddd/pipeline-opentelemetry`: the default tracer and meter name is
  `'@cqrs-ddd/pipeline-opentelemetry'`; pass `tracerName`/`meterName` `'nestjs-pipeline'`
  to keep the old scope name.
- `@cqrs-ddd/core`: `CACHE_TOKEN` is gone (no DI tokens); `@cqrs-ddd/mikro-orm` needs the
  peer `@mikro-orm/core` `^7.2.3`.
- `PipelineLogger` stays compatible with NestJS's `LoggerService`; `pinoLogger(pino)`
  adapts pino.
- Documentation: https://aristoteliss.github.io/ddd-cqrs/ ("Coming from NestJS" lists
  what carries over from `@nestjs/cqrs`).

## Decisions

- One implementation, in `@cqrs-ddd` (owner, 2026-10-01).
- The `@nestjs-pipeline/*` packages stop at 0.4.x: no 0.5.0, no plugin. They keep every
  version on npm; nothing is unpublished. From 0.5.0, `api` uses the `@cqrs-ddd` packages
  directly (owner, 2026-10-04). This replaces the earlier plan of a NestJS plugin with
  modules, DI tokens and a registration contract.
- The redirect is carried by README notices only, on GitHub and, through the README-only
  0.4.3 release, on npm; no `npm deprecate` (owner, 2026-10-04).
- This repository keeps its old code on GitHub; only its READMEs change (owner,
  2026-10-04).
- Everything is tried on the local registry before anything is published (owner,
  2026-10-04).
- Breaking changes for `api` are accepted when they simplify and keep functionality.
- `api` keeps all of NestJS and `@nestjs/cqrs`; the packages only add functionality on top;
  `@cqrs-ddd/cqrs` is not used here; the glue lives in `api`, as small as possible (owner,
  2026-10-04). Using the packages without NestJS belongs to ddd-cqrs.
- Building behaviors with `new` in provider factories costs nothing per request (they are
  built once, as the old module factories built them); per request one precompiled runner
  call wraps the handler. Guards against duplicate or leaked instances: one instance per
  behavior identity (a second fails startup); a global behavior needing a dependency and
  given no instance fails startup; one installed copy of each stateful package (`pnpm why`);
  no `@nestjs-pipeline/*` left in `api` (else behaviors run twice); each module registers
  its own behaviors and the root never builds one, so import order cannot pick a copy; each application's own
  handler instances are wrapped, never the shared prototype (several applications run in
  one test process), and unwrapped on shutdown; the old modules' shutdown cleanup is kept
  (answer to the owner, 2026-10-04).

## Modified Files

- `.claude/tasks/adopt-cqrs-ddd-packages.md`: this file, rewritten 2026-10-04 from the
  decisions taken in ddd-cqrs (it replaces ddd-cqrs's `nestjs-pipeline-local-trial.md`).
- `AGENTS.md` (The two repositories, Source of truth), `CLAUDE.md` (The sibling
  repository), `.agents/skills/nestjs-pipeline-architecture/SKILL.md` (Source of truth):
  the permanent description of how this repository and ddd-cqrs connect (owner,
  2026-10-04).
- Uncommitted (1.2): `api/package.json` (dependencies, description), `pnpm-lock.yaml`,
  `pnpm-workspace.yaml` (`minimumReleaseAgeExclude`, ask before committing), and the 148
  files of `api/src` and `api/test` the import rewrite touched.

## Tests and Verification

- In ddd-cqrs (2026-10-04): `pnpm verify:all` passed (2,882 Vitest tests, 7
  `node --test` cases, 20 packages packed and installed alone, every coverage threshold
  met); its `api` end-to-end suites passed (356 tests, Docker); the 20 packages are on
  the local registry at 0.5.0, and a scratch project installed and imported them.
- Here: nothing run yet. Read-only checks (2026-10-04): no `EventPublisher` and no
  `Command<R>` in `api`; controllers already type results with `execute<C, R>()`; 21 files
  of `api/src` import `@nestjs/cqrs` and keep doing so.

## Risks

- Two installed copies of a stateful package (`@cqrs-ddd/pipeline`, `pipeline-tenant`,
  `pipeline-correlation`, `pipeline-job-context`) split its store; `api` must resolve one
  copy of each.
- Publishing a 0.4.3 with the npm registry configured while testing would publish it for
  real; every trial command names the local registry explicitly.
- A `.npmrc` pointing at localhost committed by mistake breaks CI and other machines.

## Open Questions

- Q1: once 0.4.3 is published, do `packages/*` stay in this repository as the frozen
  0.4.x source, or are they removed later, leaving `api` alone?
- Q2 (answered 2026-10-04: use NestJS's way): done in 1.2a.
- Q4 (answered 2026-10-04: keep 0.4.x releasable): the release check runs per line.
- Q3 (answered 2026-10-04: NestJS's way): done in 1.2a.

## Next Steps

1. The owner publishes (3.1): ddd-cqrs first (its step 8.3, now with `@cqrs-ddd/nestjs`);
   then here `pnpm update "@cqrs-ddd/*"` without the local-registry config, so the lockfile
   takes the npm tarballs, and rerun every suite; then
   `pnpm --filter @nestjs-pipeline/cqrs-ddd publish --access public` and the 14 0.4.3
   releases (`pnpm --filter "./packages/pipeline*" publish --access public`). Never
   `pnpm publish:all` here: it would try to republish the 0.4.2 copies.
2. 3.3: move what lasts to its owners and delete this file.

## Snapshot Impact

Yes: dependencies, entry points and conventions of `api` change (Phase 3.2).

## Last Updated

2026-10-04
