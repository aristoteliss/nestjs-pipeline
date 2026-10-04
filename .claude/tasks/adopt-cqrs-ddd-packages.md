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
ddd-cqrs's `.claude/tasks/cqrs-ddd-pipeline.md` (Task, Goal, Scope); none of these edits
is committed yet (commits only after the owner agrees). No code has changed. The local
registry answers on `http://127.0.0.1:4873/`. Phase 0.3 is done (branch `adopt-cqrs-ddd`); next: 1.1 and 1.2.

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
  from `develop` at `0caf5535`; nothing committed on it yet.

### Phase 1: `api` 0.5.0 on the `@cqrs-ddd` packages

- [ ] 1.1 Point `api` at the local registry during the trial without committing it: an
  untracked `.npmrc` in `api/` or `--registry http://127.0.0.1:4873/` on install. A
  committed `.npmrc` with a localhost registry would break CI.
- [ ] 1.2 Replace the `@nestjs-pipeline/*` workspace dependencies of `api` with
  `@cqrs-ddd/*@^0.5.0`, then move the imports with a one-off codemod (scratch, never
  committed): 102 files in `api/src` import `@nestjs-pipeline/*` (2026-10-04). Package
  successors are in the table below.
- [ ] 1.3 The glue, in `api` only and kept small (owner, 2026-10-04: "very small, near zero
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
  `@nestjs/cqrs` dispatches as today and calls `instance.execute()` at call time, so the
  wrapped method is what runs.
- [ ] 1.4 The two request-scoped handlers (`UpdateUserHandler`, `UpdateRoleHandler`) and
  `CaslPermissionSource` become singletons (they read the principal from
  `AsyncLocalStorage`); the bootstrap refuses a request-scoped handler that declares a
  pipeline, with a message saying why.
- [ ] 1.5 Verify: `api` lint and unit tests, then `pnpm test:e2e` (Docker), in particular
  the pipeline composition, identity, bootstrap, context-source, skip, span-attribute,
  cache-partitioning and job-context suites.
- [ ] 1.6 Each failure caused by a `@cqrs-ddd` package is fixed in ddd-cqrs, the version
  removed from the local registry
  (`npm unpublish @cqrs-ddd/<name>@0.5.0 --force --registry http://127.0.0.1:4873/`),
  republished, reinstalled here, and recorded under Decisions with its fix.

### Phase 2: README notices and the 0.4.3 release

- [ ] 2.1 A notice at the top of the root README, of every `packages/*/README.md` and of
  the documentation site's home page: the package continues from 0.5.0 as its successor
  (table below), with the successor's npm page, the ddd-cqrs GitHub repository and the
  ddd-cqrs documentation site; versions 0.1 to 0.4 stay on npm unchanged. No
  `npm deprecate`: the README notice alone carries the redirect (owner, 2026-10-04).
- [ ] 2.2 Bump the 14 `@nestjs-pipeline/*` packages to 0.4.3, a README-only release (the
  code does not change), with a CHANGELOG entry saying so. An npm page shows the README of
  the latest version, so the notice reaches npm only through a new version.
- [ ] 2.3 The five `@cqrs-ddd/*` copies here (`ddd-core` as `@cqrs-ddd/core`,
  `ddd-mikro-orm`, `safe-stringify`, `untyped`, `uuidv7`) get the notice in their READMEs
  on GitHub but are never published from this repository again: ddd-cqrs publishes those
  names from 0.5.0, and its README replaces theirs on npm.
- [ ] 2.4 Try the notices on the local registry: publish the 0.4.3 releases there, check
  that `npm view @nestjs-pipeline/<name> readme --registry http://127.0.0.1:4873/` shows
  the notice, that 0.4.3 installs, and that 0.1 to 0.4.2 are still listed.

### Phase 3: hand over and close

- [ ] 3.1 Order for the owner: publish `@cqrs-ddd` 0.5.0 from ddd-cqrs (its release task,
  step 8.3), so every link resolves; push this repository's branch; publish the 0.4.3
  notice releases of the 14 `@nestjs-pipeline/*` packages; switch `api` to the npm
  packages and rerun its suites.
- [ ] 3.2 Context files (`AGENTS.md`, `CLAUDE.md`, nested `CLAUDE.md` files, the
  architecture skill, `.claude/codebase-map.md`) describe the new shape; `pnpm
  context:update`, `pnpm context:validate`.
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

## Next Steps

1. Ask the owner whether to commit the plan edits (`AGENTS.md`, `CLAUDE.md`, this file) on
   `adopt-cqrs-ddd`.
2. Phase 1.1: an untracked `api/.npmrc` with `@cqrs-ddd:registry=http://127.0.0.1:4873/`,
   excluded locally through `.git/info/exclude`, never committed.
3. Phase 1.2: in `api/package.json`, the 14 `@nestjs-pipeline/*` workspace dependencies
   become their `@cqrs-ddd/pipeline*` successors at `^0.5.0`, and `@cqrs-ddd/core`,
   `mikro-orm`, `safe-stringify`, `uuidv7` move from `workspace:*` to `^0.5.0`; then the
   import codemod (scratch, never committed) over the 102 files of `api/src` (and the
   specs in `api/test`).
4. Phase 1.3 and 1.4: the glue and the request-scope changes, as described above.

## Snapshot Impact

Yes: dependencies, entry points and conventions of `api` change (Phase 3.2).

## Last Updated

2026-10-04
