# Task Context

## Task

When the `ddd-cqrs` repository is complete and its packages are published on npm, make
nestjs-pipeline the NestJS plugin over them: the `@nestjs-pipeline/*` packages keep only
NestJS glue and run the `@cqrs-ddd/*` behaviors, `api` imports the published packages, and
the code that moved is removed here (owner, 2026-10-01 and 2026-10-02).

## Preconditions (blocking)

Nothing in this repository changes before all of these hold (owner, 2026-10-02):

1. `ddd-cqrs` is complete: its tasks `cqrs-ddd-pipeline.md`, `cqrs-runtime.md` and
   `api-app.md` are done (pipeline and behavior packages, the CQRS runtime with the NestJS
   API, the NestJS-free users-api, documentation, checks).
2. The `@cqrs-ddd/*` packages are published on npm (first under the `next` dist-tag, at
   the lockstep version, `0.5.0` or later).
3. The owner gives the go-ahead to start here.

Where the work is planned and tracked until then: `~/Source/ddd-cqrs/.claude/tasks/`.

## Goal

- `@nestjs-pipeline/*` packages depend on `@cqrs-ddd/*` as peers and contain only NestJS
  glue: modules, DI tokens, filters, `PipelineModule`, handler discovery, `@UsePipeline`,
  `@SkipPipeline`.
- An application keeps today's wiring: one `PipelineModule.forRoot({ globalBehaviors })`
  and one `forRoot()` per configured package; a behavior is never registered per feature
  module.
- `api` builds and passes `pnpm verify:all` and `pnpm test:e2e` on the published packages.
- The moved packages, their pages and their context files are gone from this repository.

## Scope

In scope: `packages/*`, `api/`, `docs/`, `integration/`, context files (`AGENTS.md`,
`CLAUDE.md`, nested `CLAUDE.md` files, the architecture skill, `.claude/codebase-map.md`),
CHANGELOG and an upgrading page.

Out of scope: behavior changes; new features. Behavior code is fixed in `ddd-cqrs`, then
consumed here.

## Design

### Package map

| Today (`@nestjs-pipeline/`) | Comes from `@cqrs-ddd/` | Stays in `@nestjs-pipeline/` |
| --- | --- | --- |
| `core` | `pipeline`: interfaces, context, items, contracts, plan, runner, sources, errors, `tenantSegments`, `toPostgresJson`, `LoggingBehavior`, `logging()` | `PipelineModule`, bootstrap service, handler discovery, `@UsePipeline`, `@SkipPipeline`, `LOGGING_BEHAVIOR_LOGGER` |
| `audit` | `pipeline-audit` | `AuditModule`, DI tokens |
| `cache` | `pipeline-cache` | `CacheModule`, DI tokens, connection lifecycle |
| `casl` | `pipeline-casl` | `CaslModule`, `CASL_PERMISSION_SOURCE`, `UnauthorizedActionFilter` (on `/http`) |
| `correlation` | `pipeline-correlation` | `HttpCorrelationMiddleware` wrapper; the `CorrelationFrom` presets `amqp`, `kafka`, `nats` (NestJS microservice contexts), plus `grpc` |
| `deadletter` | `pipeline-deadletter` | `DeadLetterModule`, DI tokens |
| `feature-flags` | `pipeline-feature-flags` | `FeatureFlagsModule`, DI tokens, `FeatureDisabledFilter` (on `/http`) |
| `idempotency` | `pipeline-idempotency` | `IdempotencyModule`, DI tokens, `IdempotencyConflictFilter` (on `/http`) |
| `job-context` | `pipeline-job-context` | `JobContextModule` (calls `registerJobContext`) |
| `opentelemetry` | `pipeline-opentelemetry` | nothing, unless Q1 keeps a module |
| `rate-limit` | `pipeline-rate-limit` | `RateLimitModule`, DI tokens, `RateLimitExceededFilter` (on `/http`) |
| `resilience` | `pipeline-resilience` | `ResilienceModule`, DI tokens, `InjectResiliencePolicy` |
| `tenant` | `pipeline-tenant`, as it is | nothing; the package retires |
| `zod` | `pipeline-zod` | `ZodValidationFilter` (on `/http`), `zodBadRequest`, the NestJS `createZodMapper` |
| `ddd-core`, `ddd-mikro-orm`, `uuidv7`, `safe-stringify`, `untyped` | `core`, `mikro-orm`, `uuidv7`, `safe-stringify`, `untyped` | nothing; the copies here are deleted |

The `XxxModuleOptions` types are defined in the `@cqrs-ddd` packages (their framework-free
`XxxModule.forRoot()` takes them); the NestJS modules import them and add only
`imports`/`inject`/`useFactory` for `forRootAsync()`.

### Registration in the NestJS flavor

Each package module registers its own behavior; a behavior is declared once, globally,
for all commands, queries and events, never per feature module; module configuration can
be overridden per kind and per handler.

1. `PipelineModule` registers `LoggingBehavior` itself, with the `LOGGING_BEHAVIOR_LOGGER`
   provider when one is given.
2. A package module registers its neutral behavior under the behavior class through a
   factory provider that injects the package's dependencies, its defaults and
   `LOGGING_BEHAVIOR_LOGGER`, falling back to NestJS `Logger`.
3. `PipelineModule.forRoot({ behaviors })` and `forFeature()` keep registering
   application-owned, NestJS-decorated behaviors as class providers.
4. `globalBehaviors` and `@UsePipeline` place and configure. `PipelineModule.forRoot()`
   registers a placed class that carries decorator metadata, never one without it
   (`Reflect.getMetadataKeys(type).length === 0`): that class belongs to its package module.
5. At bootstrap, a placed class no module registered and without decorator metadata is
   built once with the public `moduleRef.create()`; a missing required dependency throws
   from its constructor with a message naming it.
6. A behavior class registered by more than one module fails bootstrap, naming both
   modules (a `DiscoveryService` scan).
7. Option precedence: module defaults < the global entry of each matching scope < the
   handler's `@UsePipeline([Behavior, options])`, each a shallow merge. Skipping and
   declaring one behavior on the same handler fails bootstrap.
8. A behavior declared globally and on a handler runs once, at its global position.

The handler naming and precedence must match `@cqrs-ddd/cqrs` (same pieces:
`compilePipelinePlan`, `createPipelineRunner`); its specs are the reference.

## Plan

### Phase 1: the plugin (one package per change)

- [ ] 1.1 `@nestjs-pipeline/core`: peer `@cqrs-ddd/pipeline`; delete the moved files and
  specs; keep `PipelineModule`, the bootstrap service, handler discovery and the
  decorators; implement the registration contract (Design 1 to 8). Private NestJS
  coupling does not grow (AGENTS.md rule 9).
- [ ] 1.2 Each add-on package: its module registers the neutral behavior through a factory
  provider; its filters use the package's `/http` mapping; moved code and specs deleted;
  NestJS specs stay.
- [ ] 1.3 Retire `@nestjs-pipeline/tenant` (and `@nestjs-pipeline/opentelemetry` per Q1);
  the npm deprecation message is the owner's action.
- [ ] 1.4 Rewrite `packages/pipeline/src/package-boundaries.spec.ts` (allowed:
  `@cqrs-ddd/pipeline*` as peers and the three utilities; forbidden: `@cqrs-ddd/core`,
  `@cqrs-ddd/mikro-orm`, re-exports of `@cqrs-ddd`); update `packages/CLAUDE.md` and
  `packages/pipeline/CLAUDE.md`.
- [ ] 1.5 Specs in `api/test/` (a published package must not use `@nestjs/testing`):
  either module import order works; a class registered by two modules fails bootstrap;
  an undecorated behavior placed only globally is built once by `moduleRef.create()`; a
  missing required dependency fails bootstrap with its message; a decorated application
  behavior keeps DI and request scope; precedence per behavior.
- Verify: `pnpm --filter <package> test` (100%), `pnpm lint`, `pnpm lint:persistence`,
  `pnpm test:release`.

### Phase 2: `api`

- [ ] 2.1 A one-off codemod (scratch, never committed) moves the imports to the
  `@cqrs-ddd` packages; NestJS glue symbols stay (139 files imported `@nestjs-pipeline/*`
  on 2026-10-01).
- [ ] 2.2 Wiring unchanged: the `globalBehaviors` of `ObservabilityModule` and the modules
  of `ReliabilityModule`.
- [ ] 2.3 `@cqrs-ddd/*` dependencies at the published versions.
- Verify: `api` lint and tests, `pnpm test:e2e`, in particular the pipeline composition,
  identity, bootstrap, context-source, skip, span-attribute, cache-partitioning and
  job-context suites.

### Phase 3: remove what moved

- [ ] 3.1 Delete `packages/ddd-core`, `ddd-mikro-orm`, `uuidv7`, `safe-stringify`,
  `untyped` and the moved code of `pipeline*`; update `pnpm-workspace.yaml`,
  `copy-licenses`, `publish:all` and `integration/packages/release.mjs`.
- [ ] 3.2 Documentation: remove the `cqrs-ddd` pages and their TypeDoc entry points; link
  to https://aristoteliss.github.io/ddd-cqrs/; the plugin pages show the NestJS setup and
  link to the `@cqrs-ddd` pages for behavior options.
- [ ] 3.3 Context files: `AGENTS.md`, `CLAUDE.md`, nested `CLAUDE.md` files, the
  architecture skill (delete the `ddd-core` and `ddd-mikro-orm` ones); `pnpm
  context:update` and the manual map sections.
- [ ] 3.4 CHANGELOG and `docs/src/content/docs/upgrading/from-0-4.md`: import mapping,
  retired packages, renamed symbols, the registration change.
- Verify: `pnpm verify:all`, `pnpm context:validate`, the documentation build.

### Phase 4: close

- [ ] 4.1 `pnpm verify:all` passes in both repositories.
- [ ] 4.2 Move durable content to its owners and delete this file.

## Decisions

- One implementation, in `@cqrs-ddd`; this repository is the NestJS plugin (owner,
  2026-10-01).
- Breaking changes for plugin users are accepted when they simplify and keep
  functionality: moved imports, retired packages, renamed well-known symbols, the
  registration change.
- No re-exports between the two scopes.
- No change here until the preconditions hold (owner, 2026-10-02).

## Modified Files

- `.claude/tasks/adopt-cqrs-ddd-packages.md`: this file. The earlier synced copies of the
  `ddd-cqrs` task files were removed from this repository (2026-10-02); their live versions
  are in `~/Source/ddd-cqrs/.claude/tasks/`.

## Tests and Verification

Not started.

## Risks

- Two installed versions of a stateful `@cqrs-ddd` package split its store; peers and the
  release check guard against it.
- The registration contract's metadata check treats any class with reflect metadata as
  NestJS-decorated; the duplicate check (Design 6) catches a double registration.
- `moduleRef.create()` ignores request scope; only undecorated classes go through it.

## Open Questions

- Q1: `@nestjs-pipeline/opentelemetry`: retire it, or keep a small module that injects
  `LOGGING_BEHAVIOR_LOGGER` into `MetricsBehavior`?
- Q2: the default tracer and meter name of `@cqrs-ddd/pipeline-opentelemetry` is
  `'nestjs-pipeline'`; if `ddd-cqrs` changes it to the package name, the plugin passes
  `'nestjs-pipeline'` to keep its telemetry scope name.

## Next Steps

1. Wait for the preconditions; then Phase 1.1.

## Snapshot Impact

Yes: package set, dependencies, entry points and conventions change (Phase 3.3).

## Last Updated

2026-10-02
