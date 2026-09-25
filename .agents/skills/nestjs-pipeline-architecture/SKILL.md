---
name: nestjs-pipeline-architecture
description: Guide architecture-sensitive implementation, reviews and documentation in nestjs-pipeline, preserving reusable library contracts and DDD boundaries.
---

# NestJS Pipeline Architecture Skill

Use this skill for any change that affects architecture, CQRS handlers, domain models, persistence, pipeline behaviors, authentication/authorization, caching, idempotency, events, queues, or application-layer services in this repository.

## Source of truth

This repository is authoritative. Before changing architecture-sensitive code, inspect the closest existing implementation and these documents:

- `README.md`
- `packages/pipeline/README.md`
- `packages/pipeline-cache/README.md`
- `ddd/core/README.md`
- `ddd/users-api/README.md`

If generic Clean Architecture / DDD / CQRS advice conflicts with this repository, follow the repository.

## Library scope and caching decisions

`packages/*` target external consumers and future applications; users-api is one
example. Local non-use does not prove a public export, adapter or supported
payload type is unnecessary. Removing a supported contract requires
consumer/compatibility reasoning beyond an example search.

Repository caching and pipeline caching are separate layers with separate owners;
keep both. Cache a repository-owned read in the repository and a composed
application result at the pipeline boundary. Do not move application composition
into a repository merely to cache it, and do not require an application query
class for every repository lookup. Invalidation is per layer: entity invalidation
does not invalidate a composed pipeline result.

Commands read through repository/application ports, never ORM clients and never
QueryBus dispatch merely to obtain data. Mutations keep the authoritative
write-side loading contract; a freshness-tolerant cached read elsewhere in a
command is allowed only when the use case states that tolerance, and never in
place of an authoritative precondition or authorization check.

Repository invalidation belongs near successful persistence, which knows the
changed entity and its old/new lookup values, including secondary keys. Cached
collections and pipeline results need their own dependency or TTL policy. Do not
promise automatic cross-layer or cross-service invalidation.

Separate reproduced defects from architectural proposals, and intended invariants
from verified guarantees. Repair cache races within the intended abstraction; do
not infer that a cache layer must be removed.

## Documentation discipline

Keep architecture documentation focused on the repository as it exists.

- Put generic agent/architecture rules in `AGENTS.md` and this skill.
- Put package and consumer usage in the nearest README. Published packages and major core/runnable areas should document their public API, setup, options, behavior, caveats, and realistic examples.
- Public reusable library functions/classes/types should have concise contract JSDoc when needed: purpose, inputs, output, observable errors/caveats, and example usage when non-obvious. Do not narrate the implementation.
- API-facing DTOs may document validation, field meaning, example payloads, and consumer expectations.
- Handlers and ordinary domain entities should be self-explanatory and normally have no narrative JSDoc. A short comment is acceptable only for a non-obvious invariant, security/concurrency constraint, or external protocol requirement.
- Do not leave review conclusions, refactor rationale, migration history, or "previously/now/used to" explanations in source comments or normal READMEs. Git history records changes.
- **No AI slop, banners, or decorative divider lines**: Never write decorative section headers, ASCII divider lines, or boxed borders (e.g. `// ── ... ──`, `// ===== ... =====`, `/* ──────────────── */`). Write clean, standard code.
- **No ticket or task identifiers in code or test suites**: Never include task/review IDs (e.g. `(S-15)`, `S-02`, `R-07`, ticket tags) in code comments, test file names, `describe` / `it` blocks, or identifier names. Tests must describe the *actual behavior or invariant*, not the development task that introduced it. Task IDs belong exclusively in task-tracking documents (such as `.claude/tasks/`).
- **Concise step markers in core logic vs. narrative signposting**: Short, concise step comments in multi-phase core mechanisms or helpers (e.g. `// 1. Validate ordering constraints`, `// 2. Validate behavior options and intent`) are helpful and welcomed. Avoid conversational narrative commentary ("This block validates...", "Here we handle...", "Helper to...") and paragraph-sized inline explanations.
- If a source comment needs a paragraph to explain ordinary application flow, simplify the code or move durable consumer guidance to the appropriate README.

## Core architecture rules

### 1. Keep CQRS handlers business-focused

`@CommandHandler`, `@QueryHandler`, and `@EventsHandler` should contain business/application orchestration, not repeated technical concerns.

Use pipeline behaviors for cross-cutting concerns whenever the repository already has a behavior for them:

- logging
- metrics / tracing
- validation
- authorization at request/type level
- audit
- rate limiting
- retries / circuit breakers
- feature flags
- dead-letter handling
- idempotency
- pipeline-level caching

Do not add manual logging, correlation plumbing, timing, retry loops, audit records, or metrics calls inside handlers when a pipeline behavior already solves that concern.

### 2. Preserve repository boundaries

CQRS handlers must not inject or import ORM/database implementations.

Allowed in handlers:

- `ICommandRepository<...>`
- `IQueryRepository<...>`
- repository injection tokens from the bounded context

Not allowed in handlers/application services:

- `MIKRO_ORM_CLIENT`
- MikroORM `EntityManager`
- concrete database clients
- direct SQL
- concrete persistence stores such as `MikroOrmStore`

Persistence implementations belong in persistence/infrastructure adapters.

### 3. Do not leak infrastructure implementations into application code

Application/CQRS code must depend on ports/interfaces, not concrete infrastructure tools.

Examples of concrete infrastructure that should stay outside application handlers/services:

- BullMQ `Queue`
- `@nestjs/bullmq` injection decorators
- JWT implementation details such as `jose`
- raw environment-variable access for business flows
- persistence-specific tenant context implementations
- DB/network-specific transient-error classifiers

If the application needs one of these capabilities, define an application-facing interface/token and bind the implementation in the composition root/infrastructure module.

### 4. Keep HTTP semantics at the presentation boundary

Do not throw Nest `HttpException` subclasses from domain or application/CQRS code for business/application outcomes.

Avoid in handlers/application services:

- `NotFoundException`
- `ConflictException`
- `UnauthorizedException`
- `BadRequestException`
- `InternalServerErrorException`

Use framework-neutral domain/application errors and map them to HTTP in controllers/pipes/filters/interceptors.

Canonical repository pattern:

- domain/application throws `DomainException`, `ConcurrencyConflictError`, `EntityNotFoundException`, or another framework-neutral error
- `DomainExceptionFilter` (or a dedicated presentation filter) maps it to HTTP (e.g. `ConcurrencyConflictError` → HTTP 409, `EntityNotFoundException` → HTTP 404, `DomainException` → HTTP 422/400)

Repositories report persistence and application semantics; presentation filters translate those semantics for the active transport. Never throw HTTP exceptions inward for convenience.

### 5. Keep domain invariants and mutations inside aggregates

Use aggregate factories and domain methods for state changes.

Canonical examples:

- `User.create(...)`
- `user.update(...)`
- `user.delete()`
- `Role.create(...)`
- `role.rename(...)`
- `role.delete()`

Do not mutate aggregate state from application code using public setters even if a setter exists for hydration/compatibility reasons. Aggregate hydration setters (`id`, `createdAt`, `updatedAt`, `version`, `username`, `department`, `name`) exist strictly for MikroORM `accessor: true` hydration and are marked `@internal`/`@deprecated`. `biome/plugins/aggregate-identity.grit` checks known hydration properties on receivers named `user`, `role`, `aggregate`, or `entity` in application layers, including literal bracket writes, compound assignments and updates. It is a syntax-only naming convention: types, aliases, dynamic keys, destructuring and reflection are outside its coverage. Domain-method mutation remains mandatory regardless of lint coverage.

Do not instantiate aggregates in application code with `new Aggregate(snapshot)` merely to trigger a repository operation. Prefer a real domain operation or an explicit application port whose name expresses the intent.

### 6. Use `CommandBaseHandler` for command lifecycle and aggregate events

For aggregate-changing commands, prefer the repository's `CommandBaseHandler` pattern.

Handlers must return the aggregate root (or an application result containing `aggregate: AggregateRoot`) so `CommandBaseHandler.execute()` publishes buffered aggregate events automatically and clears uncommitted events.

Never publish or commit domain events manually inside command handlers. Presentation-specific transformations (such as mapping to response DTOs or session cookies) belong in the controller/presentation layer via dedicated mappers (e.g. `toSessionRes(result)`), while cookie lifecycle operations belong in `SessionService`.

### 7. Keep entity-level authorization in the application path

`CaslBehavior` handles request/type-level access rules. It does not replace authorization that depends on the actual loaded aggregate or response fields.

Declare type-level requirements with `requires(...)` in `@UsePipeline`. After
loading/creating the aggregate, use `CaslAuthorizer`:

- `authorizer.authorize(action, aggregate, fields)` — void permit-or-throw check
  for writes, with the fields the command accepts, before mutation and save;
- `authorizer.project('read', aggregate, candidate)` — authorizes the entity and
  returns only the readable fields of a response or read model;
- `authorizer.can(...)` — a boolean for optional sections.

A write responds through an authorized read of the result, never with the
aggregate itself.

Human users' permissions are materialized in `user_permission_rules`, written
only by `UserPermissionsProjector`: any change to role, capability or
assignment rows other than a cascading delete must call
`UserPermissionsProjector.rebuild` for the affected users in the same
transaction.

Access tokens are short-lived and verified statelessly; the refresh token is
opaque, stored only as a hash, rotated on every use and delivered only as an
`HttpOnly` cookie. Permissions reach an access token only through the opt-in
`PERMISSIONS_IN_ACCESS_TOKEN` copy of `user_permission_rules`, and only an
authenticator may put `grants` on the session user.

Canonical references:

- `ddd/users-api/src/users/cqrs/commands/create-user.handler.ts`
- `ddd/users-api/src/users/cqrs/queries/get-user.handler.ts`
- `ddd/users-api/src/users/cqrs/queries/get-users.handler.ts`

### 8. Treat cache and idempotency short-circuiting as a security boundary

Pipeline cache/idempotency can return a result without executing the handler.

If the handler performs entity-level authorization or field filtering, a short-circuit key must include every security dimension that can change the result, including as applicable:

- tenant
- principal/user
- permission/capability scope or version
- request identity/payload

Never use a tenant-only cache key for a principal-specific or permission-filtered response.

The generic default cache key is safe only for results that are not principal/permission-specific. Use an explicit key for protected responses.

For multi-tenant security-sensitive keys, fail closed when tenant identity is required. Do not silently collapse missing tenant context into a shared `'default'` namespace unless the flow is explicitly single-tenant/dev-only. Throw `MissingTenantContextError` rather than substituting fallback defaults.

When authorization/roles can vary while the principal ID remains stable, either incorporate an authorization version/fingerprint in the key or invalidate all affected principal-scoped entries when roles change.

An outer type-level CASL check does not reproduce the handler's entity decision. Correlation IDs are tracing metadata a caller can supply or reuse, never a principal or permission boundary.

Repository caches of authorization-independent data are tenant-scoped and return detached domain data; entity/field authorization still runs in the application. Scope a repository key to the principal when the result itself depends on it.

An idempotency key is an operation identity, not a disposable response-cache key: rotating it on permission changes can let the same effect run again. Evaluate replay scope and operation deduplication together.

### 9. Keep controllers as presentation adapters

Controllers may own:

- HTTP decorators/status codes
- DTO/pipeline validation
- request/session extraction
- mapping HTTP input to commands/queries
- mapping command/query results to HTTP/session output

Controllers should dispatch through `CommandBus` / `QueryBus`, not access repositories/ORM directly.

### 10. Keep composition and runtime configuration outside business code

Bind concrete implementations in Nest modules/composition roots.

Prefer application ports for:

- token issuance
- credential verification
- current tenant reading
- queues/message dispatch
- external APIs
- clocks/IDs when business-relevant
- configuration values used by application logic

Environment variables are acceptable in bootstrap/infrastructure/configuration modules, not as hidden dependencies inside application use cases.

## Event handling rules

Use event handlers for meaningful reactions to domain events, not merely to print logs.

For fire-and-forget infrastructure side effects:

1. keep the event handler thin;
2. inject an application port, not a concrete broker implementation;
3. use `DeadLetterBehavior` when failure capture/replay is required;
4. use correlation/logging behaviors instead of manual correlation/logging code where possible.

The Nest in-memory `EventBus` is not a transactional outbox. Do not promise durable at-least-once delivery unless an explicit outbox/message-broker architecture is introduced.

Do not add an outbox automatically just because DDD commonly recommends one. It is a separate architecture decision.

## Pipeline package rules

The core pipeline intentionally integrates deeply with NestJS CQRS. Some private Nest APIs are currently used for handler discovery/bootstrap compatibility.

Do not casually refactor away or expand private framework imports.

Current accepted technical risk includes `ExplorerService`/Nest internals used by the pipeline bootstrap. Any change there requires:

- explicit compatibility reasoning
- tests for supported Nest major versions
- README/ADR update if behavior or compatibility changes

Do not use the unused CQRS metadata re-export as a precedent for more `@nestjs/cqrs/dist/*` imports.

## Query rules

Queries should be side-effect free from the business perspective.

Query repositories and decorators:

- `QueryRepository<TQuery, TResult>` accepts exactly 2 generic parameters: the query input type and the domain aggregate output type.
- `@FromCache<TQuery, TResult>` accepts 2 generic parameters. On cache miss, it extracts a detached snapshot (`toCacheSnapshot()`, `serializeFn`, or `result.toJSON()`).
- Query repositories return strictly `Promise<TEntity | null>`, eliminating ambiguous union types (`User | UserSnapshot`). Declare rehydration once through the `QueryRepository` constructor's hydration policy (`super(cache, { hydrateFn })`, every hit rehydrated), or per method with `@FromCache({ alwaysHydrate: true, hydrateFn, ... })`; decoration-time validation ensures `alwaysHydrate: true` requires `hydrateFn`. A method's own `hydrateFn` (or `null`) and `serializeFn` override the repository default.
- Concurrent reads: when an in-flight query races a concurrent write that updates the cache, `@FromCache` detects the newer cached version (`newerCheck(current, snapshot)`) and returns the hydrated newer version rather than stale database data. A stale fill must never replace newer cache state; separate read/check/write steps do not prove that guarantee, so verify the coordination through the final write.
- Anti-resurrection: `@Cache` writes a `CacheMutationBarrier` sentinel on deletions and secondary key invalidations, and `@FromCache` fills only through a revision-fenced `IVersionedCache`: it observes the key's revision before the database read and commits with `tryFill` only if nothing advanced it, so a stale snapshot cannot overwrite a barrier; a rejected fill re-reads and boundedly retries. An adapter with only `get`/`set` cannot be fenced, so `@FromCache` bypasses it for both reads and fills. Test invalidation after the last read but before fill, absence/expiry ABA, delete/recreate and retry exhaustion; the presence of barriers is not proof that all races are prevented, and DB commit plus cache maintenance remains a separate consistency boundary.
- Cache adapters (`ICache<TSnapshot>`) store strictly serializable snapshots, never live domain aggregates. `MemoryCache` enforces deep detachment parity with database caches via JSON cloning on `set()` and `get()`.
- `MikroOrmCache` (`ddd/core`) executes queries outside the identity map (`{ disableIdentityMap: true }`) and never deletes an expired row: it reports it as `expired` and keeps its revision, so an expired reader cannot purge a concurrent fresh write.

Query handlers:

- depend on `IQueryRepository<TQuery, TEntity | null>`
- perform authorization/filtering after loading using `CaslAuthorizer`
- return secure snapshots/read models to presentation (e.g. `UserSnapshot | null`)
- must not mutate aggregates or persist writes

Repository-level read-through cache (`@FromCache`) is a good fit for authorization-independent aggregate data. Pipeline cache is appropriate only when its key safely partitions all dimensions of the final response.

## Command rules

Command handlers should express the use case in a small sequence:

1. load required aggregate(s) through `IWriteSideAggregateRepository<TEntity, TId = string>` (which returns `Promise<TEntity | null>` directly, using `{ refresh: true }` and `mapPersistenceError`);
2. fail with framework-neutral application/domain errors if preconditions are not met;
3. authorize against the real aggregate if required;
4. call aggregate domain methods;
5. persist through `ICommandRepository`;
6. return aggregate or explicit result;
7. let `CommandBaseHandler` manage aggregate event publication.

Cross-cutting concerns belong in `@UsePipeline(...)` declarations or module-wide behavior configuration.

## Repository implementation rules

Concrete repositories may use ORM/database APIs and cache implementations.

Repositories are responsible for persistence mechanics such as:

- persistence mapping/rehydration
- optimistic locking
- cache invalidation/read-through caching
- tenant-specific DB access
- translating low-level persistence errors into framework-neutral errors when required by the application contract

Do not throw HTTP exceptions from repositories.

### Persistence lifecycle decorators

On command repository `save()` operations whose first argument is the aggregate and which acknowledge the persisted version (creates and updates), use `@PersistedWrite({ cache, unique, otherwise })`. It applies the three decorators below in canonical order with the first argument as the entity. Keep the individual decorators for other signatures, for deletes (which do not acknowledge), and for caller-owned ordering; never combine the two forms on one method. The individual decorators, outermost-to-innermost:

1. `@Cache(...)`: Write-through cache synchronization/invalidation after durable write and acknowledgment, using detached snapshots from `toCacheSnapshot()`. CAS comparison (`isCacheNewer`) keeps late-finishing writes from overwriting newer cached versions, and entity deletions (`deleteKeys`) and secondary invalidations (`invalidateKeys`) install a `CacheMutationBarrier` sentinel (`{ ttl: 0, reason: 'deleted' | 'invalidated', token: uuidv7() }`) against stale snapshot resurrection. Verify the atomic coordination of these mechanisms with readers; a barrier installation alone does not prove anti-resurrection or cross-store strong consistency.
2. `@AcknowledgePersisted({ entity: ([arg]) => arg })`: Captures entry version, updates `aggregate.acknowledgePersisted(version)` only after the persistence promise resolves.
3. `@MapPersistenceErrors({ entity, unique: [...] })`: Translates known driver constraint errors (PostgreSQL 23505 and SQLite column matches) into domain exceptions before throwing.

### Optimistic updates and conditional deletes

Persistence adapters may observe ORM/driver-specific conflict signals. Repository helpers surface version conflicts as framework-neutral `ConcurrencyConflictError`, keeping application/domain code independent of MikroORM error classes. Presentation maps this error to HTTP 409. Missing rows remain `EntityNotFoundException`; unique-constraint and other database errors retain their separate mappings.

- **Updates**: Use `optimisticUpdate(em, entityType, aggregate, data, entityName)` for update repositories.
  - Updates are conditioned on `WHERE id = ? AND version = aggregate.getExpectedVersion()`, updating `version` to `aggregate.version`.
  - Rejects outer transactions (`em.isInTransaction()`) because external transactions require commit-time acknowledgment and cache eviction.
  - On 0 affected rows, runs a refreshed diagnostic read: raises `EntityNotFoundException` if entity is gone, or `ConcurrencyConflictError` if version mismatch.
- **Deletes**: Execute conditional `nativeDelete(entityType, { id: aggregate.id, version: aggregate.getExpectedVersion() })`.
  - On 0 affected rows, perform a refreshed existence check to raise `EntityNotFoundException` or `ConcurrencyConflictError`.
- **Lint Enforcement**: Persistence structure and conventional aggregate setter writes are checked by Biome Grit plugins (`biome/plugins/persistence-lifecycle.grit`, `aggregate-identity.grit`). Run `pnpm lint:persistence` and `pnpm check` to verify.

## Domain model rules

Domain models must remain free from:

- HTTP/Nest presentation exceptions
- ORM decorators or DB-specific types unless the repository explicitly standardizes otherwise
- queue/broker APIs
- environment variables
- logging/telemetry

Use `DomainException` subclasses for invariants/business errors.

Creation factories should record creation events. Rehydration methods must not record creation events.

Application code should not bypass factories/domain methods by using public constructors directly.

## No production code for tests

Tests observe the system; they do not get their own API.

Never add or widen any of these because a test needs it:

- an `export` on a function, constant, or type that no non-test module imports;
- a parameter whose only non-default argument comes from a spec (for example an
  injectable module/dependency override);
- an option, flag, or branch that only a test sets;
- process-global or static state that only a test reads.

Each of these makes the signature or lifetime of production code answer to the
test rather than to the problem, and it hides how much of the real path is
actually covered: a unit test calling an exported internal proves the internal
works, not that anything calls it correctly.

Instead:

- test through the surface real callers use — the bus, the behavior, the
  repository, the HTTP boundary;
- to control a dependency at a module boundary, mock the module in the spec
  (`vi.mock('@nestjs/cqrs', ...)`), which needs no production seam;
- to reach an integration path that needs a Nest application, put the spec in
  `ddd/users-api`, never in a published package — a published package must not
  depend on `@nestjs/testing`;
- if the behavior genuinely cannot be reached from any real caller, that is dead
  code: delete it rather than testing it.

A helper extracted for readability and used by production code is fine; what is
forbidden is surface that exists solely so a test can reach inside.

## Security checklist before finishing a change

Before finalizing an architecture-sensitive change, verify:

- [ ] No ORM/database implementation leaked into a handler/application service.
- [ ] No HTTP exception leaked into domain/application code.
- [ ] No BullMQ/JWT/env/config implementation leaked into a use case that could depend on a port.
- [ ] Cross-cutting concerns use pipeline behaviors when available.
- [ ] Entity/field authorization still runs against the actual aggregate/result.
- [ ] Cache/idempotency keys contain tenant + principal + permission scope when required.
- [ ] Missing tenant context cannot merge security-sensitive operations into a shared namespace.
- [ ] Aggregate mutations use domain methods/factories, not setters/synthetic snapshots.
- [ ] Command event publication follows `CommandBaseHandler` semantics.
- [ ] Mutating command handlers inject `IWriteSideAggregateRepository<TEntity>` and work strictly with domain aggregates, never snapshots.
- [ ] Query handlers do not perform writes.
- [ ] Controllers remain presentation adapters.
- [ ] Event handlers do not exist only for observability logging.
- [ ] New infrastructure dependency is introduced through a port unless it is clearly a composition/presentation adapter.
- [ ] Persistence write methods use `@PersistedWrite(...)` or follow `@Cache` -> `@AcknowledgePersisted` -> `@MapPersistenceErrors` decorator order.
- [ ] Entity updates use `optimisticUpdate()` and reject active outer transactions (`em.isInTransaction()`).
- [ ] Entity deletes condition on `{ id, version: aggregate.getExpectedVersion() }` and assert affected rows.
- [ ] Cache mutations install mutation barriers to prevent stale reader resurrection.
- [ ] Tests cover the relevant architectural boundary, persistence lifecycle, and security behavior.
- [ ] No export, parameter, option, or retained state was added or widened only so a test could reach it.
- [ ] New tests exercise the real call path rather than an internal reached through a test-only export.
- [ ] `pnpm lint:persistence` passes with zero diagnostics.

## Positive examples to copy

Prefer adapting these files rather than inventing a new pattern:

- Command + pipeline + domain mutation: `ddd/users-api/src/users/cqrs/commands/create-user.handler.ts`
- Command update flow: `ddd/users-api/src/users/cqrs/commands/update-user.handler.ts` (authoritative pattern: loads via write-side repository `findById`, throws framework-neutral `EntityNotFoundException` on absence, authorizes aggregate, calls domain update method, persists, and auto-publishes events via `CommandBaseHandler`)
- Update repository with lifecycle decorators: `ddd/users-api/src/roles/persistence/update-role.command-repository.ts` and `ddd/users-api/src/users/persistence/update-user.command-repository.ts`
- Create repository with lifecycle decorators: `ddd/users-api/src/users/persistence/create-user.command-repository.ts`
- Conditional delete repository: `ddd/users-api/src/users/persistence/delete-user.command-repository.ts`
- Authorized single query: `ddd/users-api/src/users/cqrs/queries/get-user.handler.ts`
- Authorized collection query: `ddd/users-api/src/users/cqrs/queries/get-users.handler.ts`
- Domain aggregate: `ddd/users-api/src/users/domain/models/user.entity.ts`
- Framework-neutral domain error: `ddd/users-api/src/users/domain/models/errors/email.exception.ts`
- HTTP mapping boundary: `ddd/users-api/src/common/filters/domain-exception.filter.ts`
- Command lifecycle: `ddd/core/application/command-base.handler.ts`
- Session cookie management: `ddd/users-api/src/auths/services/session.service.ts`
- Permission source & principal discriminator: `ddd/users-api/src/auths/persistence/casl-permission.source.ts`

## Architectural anti-patterns to avoid

Never introduce or re-introduce these patterns:

- Nest HTTP exceptions (`NotFoundException`, `ConflictException`) in command or query handlers (use `EntityNotFoundException`, `ConcurrencyConflictError`, or `DomainException` instead)
- Merging session cookie logic, credential validation, and JWT operations into a single application service (use `SessionService` for presentation cookies and `UserLoginService` for domain login)
- CQRS event handlers injecting BullMQ queues directly without application ports
- Event handlers that only call `Logger`/`getCorrelationId()` without performing meaningful domain work
- CQRS handlers importing persistence-specific error classifiers (e.g. `isTransientPersistenceError` from `@nestjs-pipeline/ddd-core/persistence`)
- Tenant-only pipeline cache keys for responses filtered by principal permissions
- Defaulting missing tenant context to `'default'` instead of failing closed with `MissingTenantContextError`
- Synthetic `new Auth({ userId, token: '' })` snapshots used as command payloads (pass explicit scalar parameters `{ userId, token }`)
- Legacy `DomainOutcome` wrappers (aggregates manage domain events internally via `this.apply(event)`)
- Inverting persistence decorator order (must be `@Cache` -> `@AcknowledgePersisted` -> `@MapPersistenceErrors`), or stacking an individual lifecycle decorator on top of `@PersistedWrite`
- Calling `aggregate.acknowledgePersisted()` manually inside repositories instead of using `@AcknowledgePersisted`
- Calling `optimisticUpdate` inside an active transaction without an explicit commit-hook contract
- Unchecked deletes using only `{ id }` without checking `aggregate.getExpectedVersion()` and affected rows
- Manual try/catch blocks in command repositories for constraint mapping when `@MapPersistenceErrors` can be used declarative
- Exporting an internal function, or adding a dependency-injection parameter, so that a spec can call it directly (`@internal Exported for tests`)
- Process-global registries or counters kept alive only so a test can observe them
- Depending on `@nestjs/testing` from a published package in order to write an integration test
