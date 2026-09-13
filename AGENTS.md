# Repository Agent Instructions

These instructions apply to every agent/LLM making changes in this repository.

## Architecture-sensitive changes

Before changing any of the following areas, **MUST read and follow**:

- `.agents/skills/nestjs-pipeline-architecture/SKILL.md`

This requirement applies to changes involving:

- NestJS CQRS commands, queries, or event handlers
- pipeline behaviors and decorators
- Clean Architecture / DDD boundaries
- domain entities, domain events, or domain errors
- repositories, persistence, ORM/database access, caching
- authentication, authorization, tenant context, sessions, JWTs
- idempotency, retries, rate limiting, auditing, metrics, tracing
- queues, background jobs, external services, or infrastructure adapters
- application services or composition-root/module wiring

## Source of truth

The repository's current code and documentation are authoritative. Generic Clean Architecture, DDD, CQRS, NestJS, or TypeScript guidance is secondary. If external advice conflicts with an intentional repository decision, follow the repository and document any proposed architectural change explicitly.

## Non-negotiable repository rules

1. CQRS handlers depend on repository/application interfaces and injection tokens, not ORM/database clients or concrete infrastructure implementations.
2. Domain/application code must not use Nest HTTP exceptions for business/application outcomes; map framework-neutral errors at the presentation boundary (e.g. `DomainException`, `EntityNotFoundException`, `OptimisticLockError` mapped in `DomainExceptionFilter`).
3. Keep repeated cross-cutting concerns in pipeline behaviors when the repository provides one; handlers should remain business-focused.
4. Keep entity-level authorization and field filtering in the application path after the real aggregate/result is available.
5. Cache/idempotency short-circuit keys must include tenant, principal, and permission scope whenever those dimensions can change the final authorized response. Fail closed when required security context is absent; never silently fall back to shared `'default'` namespaces.
6. Mutate aggregates through factories/domain methods, not direct setters or synthetic snapshots constructed only to trigger persistence.
7. Keep concrete queues, JWT libraries, environment/configuration access, persistence contexts, and similar infrastructure behind application-facing ports when used by application code.
8. Follow `CommandBaseHandler` event-publication semantics for aggregate-changing commands; do not duplicate event publication.
9. Do not introduce or expand private NestJS framework API coupling casually. Existing private CQRS bootstrap usage is an accepted repository trade-off and requires compatibility reasoning/tests before changing it.
10. Do not assume Nest's in-memory EventBus is a transactional outbox. Durable delivery requires an explicit architecture decision.
11. Persistence write operations (`save()`) must use declarative lifecycle decorators in canonical outermost-to-innermost order: `@Cache(...)` -> `@AcknowledgePersisted(...)` -> `@MapPersistenceErrors(...)`.
12. Aggregate persistence acknowledgment (`acknowledgePersisted()`) must occur only after durable persistence succeeds (handled automatically by `@AcknowledgePersisted`); never advance the persisted version baseline on failed writes or uncommitted transactions.
13. Entity updates must use version-conditioned writes (`optimisticUpdate()`) requiring autocommit (`em.isInTransaction()` rejects outer transactions) and matching `WHERE id = ? AND version = expectedVersion`. Entity deletions must condition on `{ id, version: aggregate.getExpectedVersion() }` and inspect affected rows to distinguish missing entities (`EntityNotFoundException`) from concurrency conflicts (`OptimisticLockError`).
14. Persistence lifecycle structure and standalone package isolation are guarded by Biome Grit plugins (`biome/plugins/persistence-lifecycle.grit`, `package-licenses.grit`, `verify-package-licenses.grit`, `test-suite.grit`); verify with `pnpm lint:persistence` and `pnpm check`.
15. Repository cache adapters (`ICache<TSnapshot>`) store strictly serializable snapshots, never live domain aggregates. `MemoryCache` enforces deep detachment parity with external caches via JSON cloning on `set()` and `get()`. Query repositories use `@FromCache({ alwaysHydrate: true, ... })` and return strictly domain aggregates (`Promise<User | null>`), requiring `hydrateFn` at decoration time and eliminating ambiguous union types (`User | UserSnapshot`) from query handlers.
16. Cache writes and reads must maintain strict concurrency safety: `@Cache` write-through operations use CAS version comparisons (`isCacheNewer`) so late-finishing writes cannot regress cache state; `@FromCache` returns the newer cached snapshot when concurrent mutations race with database reads; and `MikroOrmCache` bypasses the identity map (`disableIdentityMap: true`) and uses conditional CAS deletion on expired entries to prevent deleting concurrent fresh writes.

## Before finishing

For architecture-sensitive work:

- compare the implementation with the positive examples listed in the architecture skill;
- run the narrowest relevant typecheck/tests plus any affected package tests;
- update architecture documentation when a deliberate repository decision changes.
