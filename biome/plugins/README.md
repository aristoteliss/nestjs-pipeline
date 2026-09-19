# Repository Biome Grit Plugins

Native Biome analyzer plugins registered in the root `biome.json`. They report diagnostics; they do not rewrite code automatically.

## Plugins

### 1. `persistence-lifecycle.grit`
Enforces aggregate persistence lifecycle rules across all repositories (`**/persistence/**/*.ts`):
- Exactly `@Cache`, `@AcknowledgePersisted`, `@MapPersistenceErrors`, in that order.
- Awaited `optimisticUpdate()` call without unawaited writes.
- No manual `acknowledgePersisted`/`markPersisted` invocations.
- Repositories named `Update*CommandRepository` must declare their decorated `save()`.
- Canonical named imports from `@nestjs-pipeline/ddd-core`.
- No hand-rolled `try`/`catch` inside a `*CommandRepository.save()`. Error translation
  belongs in the decorator stack, where its ordering relative to `@AcknowledgePersisted`
  and `@Cache` is explicit: `@MapPersistenceErrors({ unique: [...] })` for constraint
  violations, and its `otherwise` translator for transient driver failures.

### 2. `test-suite.grit`
Enforces test suite integrity across all test files (`**/*.spec.ts`, `**/*.test.ts`):
- Forbids committing focused test runners (`describe.only`, `it.only`, `test.only`, `fit`, `fdescribe`) to ensure the entire test suite executes in CI and local verification.

### 3. `verify-package-licenses.grit`
Enforces standalone package licensing boundaries for published libraries (`**/packages/**/*.ts`):
- Forbids standalone published packages from depending on internal `ddd/` application modules (`../../ddd` or `@nestjs-pipeline/ddd-*`), guaranteeing that package distributions maintain self-contained commercial/AGPL licensing boundaries.

### 4. `package-licenses.grit`
Enforces framework compatibility in standalone published libraries (`**/packages/**/*.ts`):
- Forbids imports of private internal NestJS framework modules (e.g. `@nestjs/.../internal...`, `router-execution-context`), ensuring published packages only depend on public, stable framework contracts under their declared license tiers.

### 5. `transport-neutral-errors.grit`
Enforces `AGENTS.md` rule 2 / `SKILL.md` rule 4 across the published packages, `ddd/core`,
and the application's `cqrs/`, `domain/` and `application/` trees:
- Forbids importing or constructing NestJS HTTP exceptions (`ForbiddenException`,
  `NotFoundException`, `ConflictException`, …) in domain, application or behavior code.

Behavior packages are transport-agnostic: a handler running over a message broker, a BullMQ
worker or a CLI cannot interpret an object carrying `getStatus() === 403`, and a dead-letter
transport cannot tell an authorization denial from an infrastructure failure. Presentation
adapters (`controllers/`, `filters/`, `guards/`, `interceptors/`, `middlewares/`, `pipes/`)
are excluded, because mapping neutral errors to a transport is exactly their job.

### 6. `handler-boundaries.grit`
Enforces `AGENTS.md` rule 1 / `SKILL.md` rule 2 across `**/cqrs/**` and `**/application/**`:
- Forbids `@mikro-orm/*` imports, concrete persistence stores, and infrastructure tokens
  (`MIKRO_ORM_CLIENT`, `MikroOrmStore`, `EntityManager`, …) in handlers and application services.

Handlers depend on `ICommandRepository` / `IQueryRepository` / `IWriteSideAggregateRepository`
through injection tokens; persistence mechanics stay in the adapters under `persistence/`.

### 7. `event-handler-substance.grit`
Reports `@EventsHandler` classes whose `handle()` logs or reads the correlation ID but never
awaits any work (`**/events/**`). `SKILL.md` names this in its anti-pattern list.

Severity is **`warn`**, not `error`: `ddd/users-api` is a showcase, and several of its event
handlers exist to demonstrate that domain events reach handlers and that the correlation ID
survives the hop. The diagnostic keeps that trade-off visible without blocking the build.
Raise it to `error` in a real application, where such a handler is pure overhead — a DI
provider, a `PipelineContext` allocation and an OpenTelemetry span per event, for a line
`LoggingBehavior` already emits.

### 8. `core-environment.grit`
Enforces `SKILL.md` rule 10 across the published packages and `ddd/core`:
- Forbids `process.env` reads in shared library and DDD core code.

Configuration belongs in the composition root, passed in through a module option or an
application port. A `process.env` read in a shared helper is invisible at the call site and,
when evaluated at module load, cannot be overridden by any later configuration. Where such a
value guards tenant or principal isolation, a missing variable must fail closed rather than
substitute a default. JSDoc examples are unaffected — Grit matches syntax, not comments.

### 9. `aggregate-identity.grit`
Enforces `AGENTS.md` rule 6 / `SKILL.md` rule 5 across `cqrs/`, `application/`, `controllers/`, `services/`, `mappers/`, and `jobs/`:
- Forbids direct property assignment to aggregate hydration setters (`id`, `createdAt`, `updatedAt`, `version`, `username`, `department`, `name`).
- Protects the D-03 pragmatic mapping trade-off: setters exist solely for MikroORM `accessor: true` hydration. Application code must mutate aggregates through domain methods and factories.

---

## Manifest guard (not a Grit plugin)

Packaging invariants live in `packages/pipeline/src/package-boundaries.spec.ts`, not in a Grit
plugin, because Biome's GritQL engine only parses JavaScript and TypeScript. A `language json`
pattern compiles but never matches, so a manifest rule written that way would silently pass —
the worst possible failure mode for a guardrail. The checks run under `pnpm test` like any
other spec, and belong to the core package because it is core's own contract that every
sibling resolves exactly one copy of it:

- `@nestjs-pipeline/core` must be a `peerDependency`, never a runtime `dependency`. Core owns
  process-wide singletons — the `pipelineStore` `AsyncLocalStorage` and the module-scoped
  `Symbol()` keys used for context writes and behavior identity. A runtime dependency lets a
  consumer resolve a second copy, after which correlation IDs, tenant IDs and behavior
  deduplication stop working with no error at all.
- That peer range must be `workspace:^`. pnpm rewrites it to `^<core version>` when the tarball
  is built, so the published range tracks core automatically. A literal range has to be edited
  in every sibling on every core release, and goes stale silently when it is not.
- No published package may depend on a sibling behavior package, or on the private,
  differently-licensed `ddd/*` workspaces.

---

## Testing & Verification

- `pnpm lint:persistence` runs Biome with plugin checks.
- `pnpm check` enforces all plugins across the repository.
- `pnpm test:unit` enforces the persistence plugin plus the full test suite, including the
  manifest guard in `packages/pipeline/src/package-boundaries.spec.ts`.
- Unit test coverage against the real Biome CLI:
  - `ddd/core/persistence/biome-persistence-plugin.spec.ts` (13 tests)
  - `ddd/core/persistence/biome-general-plugins.spec.ts` (10 tests)

Reference: [Biome linter plugins](https://biomejs.dev/linter/plugins/) and [GritQL syntax](https://biomejs.dev/reference/gritql/).
