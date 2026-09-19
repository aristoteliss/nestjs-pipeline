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

## Documentation and comment policy

Documentation describes the current repository contract: what exists, how to use it, what callers can expect, and any current caveats. Do not document review history, refactor history, removed behavior, or "before vs now" narratives.

- `AGENTS.md` and architecture skills contain generic repository/architecture instructions, not package tutorials or change history.
- Every published npm package and major runnable/core area that needs consumer guidance must have a README covering purpose, installation/setup, public API, configuration, expected behavior, caveats, and practical examples.
- READMEs are current-state manuals. Prefer "use X when..." and "X behaves..." over migration narratives such as "previously", "used to", "now", "after the fix", or descriptions of removed implementations.
- Exported library functions/classes/types that are intended for reuse outside their file/module should have concise API documentation when the signature alone is insufficient. Document purpose, parameters/type parameters, return value, observable behavior, errors/caveats, and a short example when usage is not obvious. Do not explain implementation mechanics.
- HTTP/API DTOs and response models may include third-party-facing field/validation guidance and examples.
- CQRS handlers and ordinary domain entities should not carry tutorial-style JSDoc or narrative comments. Their names, types, domain methods, and tests should explain the flow. Keep comments only for a genuinely non-obvious invariant or constraint that cannot be made clear in code.
- Internal code comments are reserved for helpers, low-level/core mechanisms, interoperability constraints, protocol requirements, concurrency/security invariants, or similarly non-obvious behavior. Keep them short; paragraph-sized comments inside ordinary application code are a smell and usually belong in a README or API doc.
- Comments must never describe a past code state or justify a completed change. Git history owns history.
- License headers, deprecation notices, generated-code markers, lint suppressions with a real reason, and externally required protocol notes are exempt from the brevity rule.

## Non-negotiable repository rules

1. CQRS handlers depend on repository/application interfaces and injection tokens, not ORM/database clients or concrete infrastructure implementations.
2. Domain/application code must not use Nest HTTP exceptions for business/application outcomes; map framework-neutral errors at the presentation boundary (e.g. `DomainException`, `EntityNotFoundException`, `ConcurrencyConflictError` mapped in `DomainExceptionFilter`).
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
13. Entity updates must use version-conditioned writes (`optimisticUpdate()`) requiring autocommit (`em.isInTransaction()` rejects outer transactions) and matching `WHERE id = ? AND version = expectedVersion`. Entity deletions must condition on `{ id, version: aggregate.getExpectedVersion() }` and inspect affected rows to distinguish missing entities (`EntityNotFoundException`) from concurrency conflicts (`ConcurrencyConflictError`). Persistence adapters translate ORM/driver version-conflict signals at this boundary; application/domain code must not depend on MikroORM error classes. `DomainExceptionFilter` maps `ConcurrencyConflictError` to HTTP 409. Unique-constraint and other database errors retain their own mappings.
14. Persistence lifecycle structure and standalone package isolation are guarded by Biome Grit plugins (`biome/plugins/persistence-lifecycle.grit`, `package-licenses.grit`, `verify-package-licenses.grit`, `test-suite.grit`); verify with `pnpm lint:persistence` and `pnpm check`.
15. Repository cache adapters (`ICache<TSnapshot>`) store strictly serializable snapshots, never live domain aggregates. `MemoryCache` enforces deep detachment parity with external caches via JSON cloning on `set()` and `get()`. Query repositories use `@FromCache({ alwaysHydrate: true, ... })` and return strictly domain aggregates (`Promise<User | null>`), requiring `hydrateFn` at decoration time and eliminating ambiguous union types (`User | UserSnapshot`) from query handlers.
16. Cache writes and reads must maintain strict concurrency safety: `@Cache` write-through operations use CAS version comparisons (`isCacheNewer`) so late-finishing writes cannot regress cache state; `@FromCache` returns the newer cached snapshot when concurrent mutations race with database reads; and `MikroOrmCache` bypasses the identity map (`disableIdentityMap: true`) and uses conditional CAS deletion on expired entries to prevent deleting concurrent fresh writes.
17. Write-side command repositories expose authoritative aggregate loading via `IWriteSideAggregateRepository<TEntity, TId = string>` returning rehydrated domain aggregates (`Promise<TEntity | null>`) directly from primary persistence (`{ refresh: true }`) mapped with `mapPersistenceError(...)`. Command handlers depend exclusively on domain models (`User`, `Role`), never on persistence snapshots (`TSnapshot`). Cache anti-resurrection is enforced via mutation barriers: `@Cache` installs a `CacheMutationBarrier` token on deletions and secondary key invalidations, while `@FromCache` executes pre/post-DB barrier checks and token validation with bounded retries (`MAX_BARRIER_RETRIES = 2`) to ensure stale in-flight queries never resurrect deleted or superseded records.

18. Production code must never exist only to serve tests. No export, parameter, option, branch, or piece of retained state may be added or widened because a test needs to reach it. In particular: do not export an internal function so a spec can import it, do not add an injectable-dependency parameter whose only caller-supplied value comes from a test, and do not maintain process-global state that nothing but a test reads. Test the behavior through the surface real callers use; if that is genuinely impossible, the design is what needs changing, not the visibility. Where a module boundary must be crossed, mock the module in the test (`vi.mock`) rather than threading a seam through the signature.

## Before finishing

For architecture-sensitive work:

- compare the implementation with the positive examples listed in the architecture skill;
- run the narrowest relevant typecheck/tests plus any affected package tests;
- update architecture documentation when a deliberate repository decision changes.
