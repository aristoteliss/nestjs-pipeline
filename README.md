# nestjs-pipeline

Pipeline behaviors for **NestJS CQRS** — wrap every command, query, and event handler with reusable cross-cutting concerns (logging, validation, tracing, audit, …) using a clean middleware-like chain.

**Documentation: [aristoteliss.github.io/nestjs-pipeline](https://aristoteliss.github.io/nestjs-pipeline/)** — getting started, concepts, guides, one guide per package, the API reference generated from the JSDoc, and the HTTP API of the example application.

## Packages

| Package | Description |
|---|---|
| [`@nestjs-pipeline/core`](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/core/) | Pipeline engine, `@UsePipeline` decorator, `PipelineModule`, `LoggingBehavior` |
| [`@nestjs-pipeline/correlation`](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/correlation/) | Standalone correlation ID propagation — HTTP middleware, `@WithCorrelation`, `runWithCorrelationId`, `getCorrelationId`, and `correlationSource` for pipelines and jobs |
| [`@nestjs-pipeline/zod`](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/zod/) | Zod v4 validation/parsing behavior that applies successful parsed object output to the request, plus `zodBadRequest` for Nest's schema validation, `ZodValidationFilter`, `ZodValidationError` |
| [`@nestjs-pipeline/opentelemetry`](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/opentelemetry/) | OpenTelemetry tracing & metrics behaviors — spans plus duration/throughput/error instruments for every pipeline invocation, and `AttributesBehavior` for the add-ons' span attributes |
| [`@nestjs-pipeline/casl`](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/casl/) | CASL authorization — type-level `CaslBehavior` fed by an application permission source, plus `CaslAuthorizer` (`can`, `authorize`, `project`, `dependsOnEntity`) for entity and field checks and `abilityDigest` for cache and replay scopes |
| [`@nestjs-pipeline/resilience`](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/resilience/) | Resilience on cockatiel — named policies for outbound dependencies (retry, circuit breaker, timeout, bulkhead, fallback), shared through DI, and a behavior for handler-level retry, timeout and bulkhead |
| [`@nestjs-pipeline/cache`](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/cache/) | Read-through caching behavior for queries — pluggable stores (memory, redis, memcache, sqlite, postgres) via cache-manager v7 on keyv |
| [`@nestjs-pipeline/feature-flags`](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/feature-flags/) | Feature-flag gating behavior — provider-agnostic via OpenFeature (Unleash shown in examples; Flagsmith/LaunchDarkly are drop-in alternatives) |
| [`@nestjs-pipeline/deadletter`](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/deadletter/) | Dead-letter capture for failed requests (events by default) — bundled BullMQ, RabbitMQ and Postgres transports; redrive with an attempt count and a resolved state for stored records |
| [`@nestjs-pipeline/rate-limit`](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/rate-limit/) | Rate-limiting behavior — backend-agnostic via rate-limiter-flexible (memory, Redis/Valkey, Mongo, SQL), HTTP 429 filter |
| [`@nestjs-pipeline/audit`](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/audit/) | Audit-trail behavior — records who/what/outcome/duration to a pluggable `AuditSink` (console default, Postgres drop-in), with payload redaction |
| [`@nestjs-pipeline/idempotency`](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/idempotency/) | Idempotency behavior — atomic concurrent duplicate exclusion and successful-response replay per key; failed executions are retryable by default, via a pluggable store (in-memory default, Redis/Postgres drop-in) |
| [`@nestjs-pipeline/tenant`](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/tenant/) | `currentTenantId()`, `runWithTenant()` and `tenantSource` — the current tenant, for code deep inside a handler and for pipelines and jobs |
| [`@nestjs-pipeline/job-context`](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/job-context/) | Carries a request's tenant, correlation id and principal into the queue jobs it enqueues (`withJobContext`, `@InJobContext`), and gives system work an explicit context (`@AsSystem`) |

> Add-on packages live in `packages/pipeline-<name>/`. Those that plug into the pipeline
> peer-depend on `@nestjs-pipeline/core`; `tenant`, `correlation` and `job-context` depend on
> no pipeline package and are connected through module options (`sources`).

Framework-neutral packages, with no NestJS dependency:

| Package | Description |
|---|---|
| [`@cqrs-ddd/core`](https://aristoteliss.github.io/nestjs-pipeline/packages/cqrs-ddd/core/) | DDD building blocks — aggregates with versioned mutations, detached domain events, `CommandBaseHandler`, repository contracts, ORM-neutral persistence lifecycle decorators, a revision-fenced repository cache, tenant-scoped cache keys and HTTP status mapping |
| [`@cqrs-ddd/mikro-orm`](https://aristoteliss.github.io/nestjs-pipeline/packages/cqrs-ddd/mikro-orm/) | MikroORM 7 adapters for `@cqrs-ddd/core` — `AggregateRepository`, version-conditioned writes, `MikroOrmCache`, `MikroOrmDialect`, the multi-tenant `TenantStore` |
| [`@cqrs-ddd/uuidv7`](https://aristoteliss.github.io/nestjs-pipeline/packages/cqrs-ddd/uuidv7/) | RFC 9562 UUIDv7 generation and validation, with no dependencies |
| [`@cqrs-ddd/safe-stringify`](https://aristoteliss.github.io/nestjs-pipeline/packages/cqrs-ddd/safe-stringify/) | A strict, key-sorted serializer for identities, a redacting serializer for logs, and the key-segment helpers, with no dependencies |
| [`@cqrs-ddd/untyped`](https://aristoteliss.github.io/nestjs-pipeline/packages/cqrs-ddd/untyped/) | `untyped(value)`: a typed replacement for `as any` that reads undeclared properties as `unknown`, with no dependencies |

> `@nestjs-pipeline/core` uses the three utilities; import them from their own packages.
> No `@nestjs-pipeline/*` package uses `@cqrs-ddd/core`, and it knows nothing of them: an
> application connects the two.

Every package is at **0.4.1**. [CHANGELOG.md](CHANGELOG.md) records each release.

## Installation

```bash
pnpm add @nestjs-pipeline/core @nestjs/common @nestjs/core @nestjs/cqrs reflect-metadata rxjs
```

Requires Node.js 22.12 or later and NestJS `^12.1.0`. Every package is an ES module; a CommonJS application loads it with `require()`. Continue with [Getting started](https://aristoteliss.github.io/nestjs-pipeline/getting-started/).

## Repository Structure

```
nestjs-pipeline/
├── package.json                  # root — workspace scripts
├── pnpm-workspace.yaml           # declares packages/* and api
├── tsconfig.base.json            # shared TypeScript config
├── packages/
│   ├── pipeline/                 # @nestjs-pipeline/core
│   │   └── src/
│   │       ├── behaviors/        # LoggingBehavior
│   │       ├── constants/        # pipelineStore (AsyncLocalStorage)
│   │       ├── decorators/       # @UsePipeline
│   │       ├── helpers/          # behavior entries, logging intent, toPostgresJson
│   │       ├── interfaces/       # IPipelineBehavior, IPipelineContext
│   │       ├── options/          # PipelineModuleOptions, GlobalBehaviorsOptions
│   │       ├── services/         # handler discovery, chain planning, runner
│   │       ├── pipeline.context.ts
│   │       └── pipeline.module.ts
│   ├── pipeline-correlation/      # @nestjs-pipeline/correlation
│   │   └── src/
│   │       ├── decorators/       # @WithCorrelation, CorrelationFrom
│   │       ├── middlewares/      # HttpCorrelationMiddleware
│   │       ├── options/          # CorrelationOptions
│   │       └── correlation.store.ts    # correlationSource, getCorrelationId, runWithCorrelationId, addCorrelationId
│   ├── pipeline-zod/             # @nestjs-pipeline/zod
│   │   └── src/
│   │       ├── errors/           # ZodValidationError
│   │       ├── filters/          # ZodValidationFilter
│   │       ├── pipes/            # createZodMapper, zodBadRequest
│   │       └── zod-validation.behavior.ts  # parse/validate and apply successful object output
│   ├── pipeline-casl/            # @nestjs-pipeline/casl
│   │   └── src/
│   │       ├── constants/        # Tokens, context keys, CASL_ACTIONS/SUBJECTS
│   │       ├── errors/           # UnauthorizedActionException
│   │       ├── helpers/          # Capability codec, buildAbility, projection, CaslAuthorizer, requires()
│   │       ├── interfaces/       # ICaslPermissionSource, CaslPrincipal
│   │       ├── casl.behavior.ts
│   │       └── casl.module.ts
│   ├── pipeline-opentelemetry/   # @nestjs-pipeline/opentelemetry
│   │   └── src/
│   │       ├── trace.behavior.ts     # TraceBehavior (OTel Trace API)
│   │       └── metrics.behavior.ts   # MetricsBehavior (OTel Metrics API)
│   ├── pipeline-resilience/      # @nestjs-pipeline/resilience
│   │   └── src/
│   │       ├── constants/        # RESILIENCE_DEFAULT_OPTIONS token
│   │       ├── helpers/          # buildResiliencePolicy (cockatiel composition)
│   │       ├── interfaces/       # ResilienceBehaviorOptions and layer option types
│   │       ├── resilience.behavior.ts
│   │       └── resilience.module.ts
│   ├── pipeline-cache/           # @nestjs-pipeline/cache
│   │   └── src/
│   │       ├── constants/        # PIPELINE_CACHE, CACHE_DEFAULT_OPTIONS tokens
│   │       ├── helpers/          # buildCache / buildKeyv (store factory), cache-key
│   │       ├── interfaces/       # CacheModuleOptions, CacheBehaviorOptions, CacheStoreConfig
│   │       ├── cache.behavior.ts
│   │       └── cache.module.ts
│   ├── pipeline-feature-flags/   # @nestjs-pipeline/feature-flags
│   │   └── src/
│   │       ├── constants/        # FEATURE_FLAGS_CLIENT and default-options/context tokens
│   │       ├── errors/           # FeatureDisabledError
│   │       ├── helpers/          # buildEvaluationContext (targeting context)
│   │       ├── interfaces/       # FeatureFlagBehaviorOptions, FeatureFlagsModuleOptions
│   │       ├── feature-flag.behavior.ts  # FeatureFlagBehavior (OpenFeature gating)
│   │       └── feature-flags.module.ts
│   ├── pipeline-deadletter/      # @nestjs-pipeline/deadletter
│   │   └── src/
│   │       ├── constants/        # DEAD_LETTER_TRANSPORT, DEAD_LETTER_DEFAULT_OPTIONS tokens
│   │       ├── helpers/          # buildDeadLetterRecord
│   │       ├── interfaces/       # DeadLetterTransport, DeadLetterRecord, options types
│   │       ├── transports/       # BullMQ, RabbitMQ, Postgres bundled transports
│   │       ├── dead-letter.behavior.ts   # DeadLetterBehavior (capture/send attempt for failed requests)
│   │       └── dead-letter.module.ts
│   ├── pipeline-rate-limit/      # @nestjs-pipeline/rate-limit
│   │   └── src/
│   │       ├── constants/        # RATE_LIMITER, RATE_LIMIT_DEFAULT_OPTIONS tokens
│   │       ├── errors/           # RateLimitExceededError
│   │       ├── filters/          # RateLimitExceededFilter (HTTP 429 + Retry-After)
│   │       ├── helpers/          # buildRateLimitKey
│   │       ├── interfaces/       # RateLimiterLike, RateLimitBehaviorOptions, module options
│   │       ├── rate-limit.behavior.ts    # RateLimitBehavior (rate-limiter-flexible)
│   │       └── rate-limit.module.ts
│   ├── pipeline-audit/           # @nestjs-pipeline/audit
│   │   └── src/
│   │       ├── constants/        # AUDIT_SINK, AUDIT_DEFAULT_OPTIONS tokens
│   │       ├── helpers/          # redactValue, buildAuditRecord
│   │       ├── interfaces/       # AuditSink, AuditRecord, options types
│   │       ├── sinks/            # LogAuditSink (default), PostgresAuditSink drop-in
│   │       ├── audit.behavior.ts # AuditBehavior (records who/what/outcome/duration)
│   │       └── audit.module.ts
│   ├── pipeline-idempotency/     # @nestjs-pipeline/idempotency
│   │   └── src/
│   │       ├── constants/        # IDEMPOTENCY_STORE, IDEMPOTENCY_DEFAULT_OPTIONS tokens
│   │       ├── errors/           # IdempotencyConflictError
│   │       ├── filters/          # IdempotencyConflictFilter (HTTP 409 / 422)
│   │       ├── helpers/          # fingerprintValue (stable payload hash)
│   │       ├── interfaces/       # IdempotencyStore, IdempotencyRecord, options types
│   │       ├── stores/           # Memory (default), Redis, Postgres drop-in stores
│   │       ├── idempotency.behavior.ts   # IdempotencyBehavior (concurrent exclusion + successful replay)
│   │       └── idempotency.module.ts
│   ├── pipeline-tenant/          # @nestjs-pipeline/tenant
│   │   └── src/
│   │       └── tenant-scope.ts   # tenantSource, currentTenantId, runWithTenant
│   ├── pipeline-job-context/     # @nestjs-pipeline/job-context
│   │   └── src/
│   │       ├── decorators/       # @InJobContext, @AsSystem
│   │       ├── errors/           # MissingJobContextError, InvalidJobContextError
│   │       ├── helpers/          # withJobContext, payload validation
│   │       ├── interfaces/       # IJobPrincipal, PrincipalReference, JobContext
│   │       └── job-context.module.ts   # JobContextModule.forRoot({ principal, tenants, sources })
│   ├── uuidv7/                   # @cqrs-ddd/uuidv7 — RFC 9562 UUIDv7, no dependencies
│   ├── safe-stringify/           # @cqrs-ddd/safe-stringify — strict and log-safe JSON, key segments
│   ├── untyped/                  # @cqrs-ddd/untyped — typed replacement for `as any`
│   ├── ddd-mikro-orm/            # @cqrs-ddd/mikro-orm — repositories, optimistic writes, cache, dialect, TenantStore
│   └── ddd-core/                 # @cqrs-ddd/core — framework-neutral DDD primitives
│       ├── domain/               # RootEntity, AggregateRoot, domain events and exceptions
│       ├── application/          # CQRS base classes, repository and cache ports, tenant scope
│       ├── persistence/          # repository base classes, lifecycle decorators, in-memory cache
│       └── http/                 # HTTP status mapping for its errors
└── api/                          # @nestjs-pipeline/ddd-api — full working example using ddd-core + casl
    └── src/
        ├── persistence/          # MikroOrmStore, schemas/, migrations, cli.ts
        ├── roles/                # role and capability CRUD
        ├── auths/                # login, sessions, permission source, job principal
        └── users/
            ├── cqrs/             # Commands, queries, events
            ├── domain/           # User entity, domain events
            └── persistence/      # Repositories
```

## Development

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run persistence lint and workspace unit/integration tests (no build or E2E)
pnpm test

# Run workspace tests with coverage
pnpm test:coverage

# Run individual stages
pnpm test:unit
pnpm test:build
pnpm test:e2e

# Persistence Grit checks and package typechecks
pnpm lint

# Format / lint with Biome (including Grit persistence rules)
pnpm check

# Run only persistence plugin diagnostics
pnpm lint:persistence

# Clean build artifacts
pnpm clean

# Remove every generated file: node_modules, dist, coverage, caches, *.tsbuildinfo, license copies
pnpm clean:all
pnpm install
```

`pnpm test:coverage` runs each workspace’s existing test script sequentially with Vitest coverage. It prints test results and a coverage summary per workspace, and writes `coverage/coverage-summary.json` in each workspace. Reports cover the same tests selected by each workspace’s Vitest configuration; E2E tests run separately. All workspaces run even if one fails, and any failure makes the command fail. There is no combined monorepo coverage total.

### Lint rules

Architecture rules are native Biome Grit plugins in `biome/plugins/`, registered and scoped
in `biome.json`. They report diagnostics and never rewrite code; they run in `pnpm check`,
in editors, and in `pnpm lint:persistence` before `test:unit`. Grit matches syntax, not
types: a rule sees names and import sources, not what a value is.

| Plugin | Rule |
| --- | --- |
| `persistence-lifecycle.grit` | `save()` in `persistence/` uses `@PersistedWrite` or `@Cache` → `@AcknowledgePersisted` → `@MapPersistenceErrors` in that order; awaited `optimisticUpdate()`; no manual `acknowledgePersisted`/`markPersisted`; no hand-rolled `try`/`catch` in a command repository `save()` |
| `aggregate-identity.grit` | No writes to hydration properties (`id`, `version`, `username`, …) on receivers named `user`, `role`, `aggregate` or `entity` in application layers. A naming convention, not a type-aware guarantee |
| `domain-mutation.grit` | In aggregates, events go in `@ApplyMutation({ event })`, which is required, and mutations use `applyPatch()` |
| `handler-boundaries.grit` | Handlers and application services import no `@mikro-orm/*`, store or ORM token |
| `ddd-layering.grit`, `ddd-entry-points.grit` | Domain and CQRS code do not import `@cqrs-ddd/core/persistence`; api code imports a layered entry point, not the root |
| `transport-neutral-errors.grit` | No Nest HTTP exceptions in packages, domain, application or CQRS code; presentation adapters map neutral errors |
| `event-handler-substance.grit` | Warns on an event handler that only logs or reads the correlation ID (`warn`, because the api keeps such showcase handlers) |
| `core-environment.grit` | No `process.env` in published packages or `packages/ddd-core`; configuration comes through module options or ports |
| `framework-independence.grit` | `packages/ddd-core`, `ddd-mikro-orm`, `uuidv7`, `safe-stringify` and `untyped` import nothing from NestJS or `@nestjs-pipeline/*`, in any import form |
| `orm-independence.grit` | `packages/ddd-core` imports no ORM or database driver |
| `verify-package-licenses.grit` | Published packages import neither the private `api` nor `@nestjs-pipeline/ddd-*`, and `@nestjs-pipeline/*` packages do not import `@cqrs-ddd/core` |
| `package-licenses.grit` | Published packages import no private NestJS internals |
| `test-suite.grit` | No focused tests (`.only`, `fit`, `fdescribe`) |

Package manifests are checked by specs instead, because Grit cannot match JSON:
`packages/pipeline/src/package-boundaries.spec.ts` requires a package whose source imports
`@nestjs-pipeline/core` to peer on it through `workspace:^`, and a package that does not
import it not to declare it; none may depend on it at runtime (a second copy of core
silently loses its async-local context and behavior identity). It also forbids
dependencies on the private `api`; each `@cqrs-ddd/*` package has its own
`package-manifest.spec.ts`. `api/test/lint/biome-persistence-plugin.spec.ts` and
`biome-general-plugins.spec.ts` run every rule against the real Biome CLI.

### Releasing

A release bumps only the packages whose published content changed; `CHANGELOG.md`
records each release and lists them. A package that depends on a bumped one keeps its
range as long as the range still covers the new version (`workspace:^` publishes as
`^<version>`). Before publishing:

1. Run `pnpm verify:all` (type checks, unit, build, release and E2E suites; E2E needs a
   container runtime). `pnpm test:release` packs every package and loads it from its
   tarball in an isolated consumer.
2. Run `pnpm copy-licenses && pnpm -r publish --access public --dry-run --no-git-checks`
   and check the list: every `@cqrs-ddd/*` and `@nestjs-pipeline/*` package, no private
   workspace (`@nestjs-pipeline/ddd-api`).
3. The npm organizations `cqrs-ddd` and `nestjs-pipeline` must exist, with your account
   allowed to publish to both.
4. Merge to `master`, then run `pnpm publish:all`. It copies the license files into each
   package and publishes in dependency order; each package rebuilds in
   `prepublishOnly`. `pnpm -r publish` skips every package whose version is already on
   the registry, so only the bumped packages are published.
5. Tag each published package as `<name>@<version>` (for 0.2.1:
   `git tag @cqrs-ddd/core@0.2.1`, `@nestjs-pipeline/casl@0.2.1`, … for the ten packages
   in the changelog) and the release as `v<version>`, then push the tags.

`pnpm test:release` (`integration/packages/release.mjs`) packs every non-private
`packages/*` workspace and checks each archive: name and version, licenses, JavaScript and
declarations, `engines.node` equal to the root's, a README without relative links outside
the package (they break on npmjs.com), no tests, and no dependency on the private `api`. No
`@nestjs-pipeline/*` package may name `@cqrs-ddd/core`. Missing, duplicate or unexpected
archives fail it. A temporary consumer outside the checkout then installs every tarball,
with required peers at the lockfile's versions and automatic peer installation off, and
compiles and runs the fixtures in `integration/packages/consumer/src/` (request-scoped
behaviors across two Nest applications, the typed intent builders, CASL 7 startup). Every
`.ts` file there is compiled and run; add a fixture for a new cross-package contract.
Finally, each `@cqrs-ddd/*` package is installed alone with its peers and the packed
packages it needs, and no NestJS: it fails if it depends on anything outside the release,
pulls in anything else, or an entry point yields no exports. Requirements: the repository's
Node and pnpm, `tar`, and registry access for uncached dependencies.

### Agent context files

`CLAUDE.md` and `.claude/codebase-map.md` give coding agents a compact orientation map of
the repository; `AGENTS.md` holds the rules every agent follows. The files:

| Path | Tracked | Purpose |
| --- | --- | --- |
| `CLAUDE.md`, and nested `CLAUDE.md` under `packages/`, `packages/pipeline/`, `packages/ddd-core/`, `packages/ddd-mikro-orm/`, `api/` | yes | Working instructions, and local rules per area |
| `.claude/codebase-map.md` | yes | The map: generated sections plus human-owned sections |
| `.claude/tasks/TEMPLATE.md`, `.claude/tasks/<task-id>.md` | yes | Template, and one file per active multi-step task |
| `.claude/settings*.json`, `.claude/state/context-checkpoint.md` | no | Local settings and the pre-compaction checkpoint |

```bash
pnpm context:update     # regenerate the map's generated sections (human-written ones are preserved)
pnpm context:check      # fail if the committed map no longer matches the repository
pnpm context:validate   # required files and headings, secret scan, size budget, path references, generator run
```

The scripts in `scripts/` need Python 3.9+ and optionally `git`, with no third-party
packages. `update-claude-snapshot.py` inspects structure only — manifests, directory layout,
import specifiers, `process.env` names, README first paragraphs, git metadata — through
`git ls-files`, and never executes project code, reads `.env*` or key material, or uses the
network. `<!-- context:generated-* -->` blocks are rewritten on every run;
`<!-- context:manual-* -->` blocks are copied through unchanged. `--check` ignores the
volatile metadata fields, so only structural drift makes the map stale. Regenerate when
architecture, modules, dependencies, entry points, commands or conventions change, then
update the manual sections and run `pnpm context:validate`.

A task file (`cp .claude/tasks/TEMPLATE.md .claude/tasks/<task-id>.md`) records decisions
and verified results of active work only; when the task is done, move what is durable into
source or a README and delete the file. `.claude/settings.json` registers a `PreCompact`
hook, `scripts/claude-context-checkpoint.py`, that writes the current branch, commit,
changed paths and task files to `.claude/state/context-checkpoint.md`. It never reads the
conversation or file contents and always exits 0; remove the `hooks` block to disable it.

## Adding a New Behavior Package

1. Create `packages/pipeline-<name>/` with `package.json`, `tsconfig.json`, `tsconfig.build.json`, and `src/index.ts`.

2. Add `@nestjs-pipeline/core` as a peer dependency:

   ```json
   {
     "peerDependencies": {
       "@nestjs-pipeline/core": "workspace:^"
     },
     "devDependencies": {
       "@nestjs-pipeline/core": "workspace:*"
     }
   }
   ```

3. Implement `IPipelineBehavior`:

   ```typescript
   import { Injectable } from '@nestjs/common';
   import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

   @Injectable()
   export class TimingBehavior implements IPipelineBehavior {
     constructor(private readonly timings: TimingService) {}

     async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
       const started = performance.now();
       try {
         return await next();
       } finally {
         this.timings.record(context.requestName, performance.now() - started);
       }
     }
   }
   ```

4. Export from `src/index.ts`:

   ```typescript
   export { TimingBehavior } from './timing.behavior';
   ```

5. The package is included through `pnpm-workspace.yaml`. Follow
   [packages/CLAUDE.md](packages/CLAUDE.md) for the rest: license headers, a README, 100%
   per-file coverage in `vitest.config.ts`, and `pnpm test:release`.

## License and Commercial Use

This software is **Dual-Licensed**.

By default, this project is licensed under the **GNU AGPLv3** (see the `LICENSE` file). You can use, modify, and distribute it freely, provided your entire application is also open-sourced under the AGPLv3.

**Commercial License (No AGPL Restrictions)**

If you are using this software commercially and cannot (or do not want to) open-source your application under the AGPLv3, you must use the **Commercial License** (see `COMMERCIAL_LICENSE.txt`).

Revenue-based pricing:

| Annual Gross Revenue | Fee |
|---|---|
| Under $500,000 | **Free** |
| $500,001 — $10,000,000 | 0.1% of gross revenue |
| $10,000,001 — $50,000,000 | 0.05% of gross revenue |
| Over $50,000,000 | 0.01% of gross revenue (capped at $50,000/year) |

Contact: **aristotelis@ik.me**
