# Repository Agent Instructions

These instructions apply to every agent/LLM making changes in this repository.

## Architecture-sensitive changes

Before changing any of the following areas, **MUST read and follow**:

- `.agents/skills/nestjs-pipeline-architecture/SKILL.md` (architecture and cache rules)

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

## Repository context files

`CLAUDE.md` (root) holds the durable working instructions for coding agents, and
`.claude/codebase-map.md` is the compact orientation map: repository shape, stack, entry
points, directory responsibilities, verified commands, critical modules and gotchas.
Nested `CLAUDE.md` files under `packages/`, `packages/pipeline/`, `ddd/core/` and
`ddd/users-api/` carry the local rules for those areas.

The map is an index, not an authority: verify any claim against the source before relying
on it, and prefer the code when they disagree. Regenerate the generated sections with
`pnpm context:update`, update the human-owned sections by hand, and verify with
`pnpm context:validate`. Never place secret values in a context or task file.
`.claude/README.md` documents the whole system.

## Library scope and review discipline

`packages/*` are reusable libraries for external applications and future use cases;
`ddd/core` provides reusable DDD primitives and `ddd/users-api` is one example, not
the product boundary. Evaluate a feature against its contract, extension purpose,
correctness, maintenance cost and compatibility, not only local call sites. Absence
of a users-api call site does not make an export, adapter or supported input type
useless; conversely, future reuse does not justify speculative abstractions.

Before removing an API, supported type, adapter or layer, establish its consumer
scope, actual cost or defect and compatibility impact, and distinguish a published
API or documented extension point, a reusable DDD primitive, an intentionally
simulated integration, optional application wiring and truly redundant internal
state. A local reference search cannot establish that external consumers do not
exist. An internal bug calls for a repair within the abstraction, not deletion or
relocation of the feature.

Label findings as a reproduced defect, a code-path inference, a contract risk or an
architectural proposal, and separate intended invariants from guarantees actually
verified by code and tests. Existing instructions express architecture intent; they
are not proof that an implementation is bug-free.

## Documentation and comment policy

Documentation describes the current repository contract: what exists, how to use it, what callers can expect, and any current caveats. Do not document review history, refactor history, removed behavior, or "before vs now" narratives.

- `AGENTS.md` and architecture skills contain generic repository/architecture instructions, not package tutorials or change history.
- Every published npm package and major runnable/core area that needs consumer guidance must have a README covering purpose, installation/setup, public API, configuration, expected behavior, caveats, and practical examples.
- READMEs are current-state manuals. Prefer "use X when..." and "X behaves..." over migration narratives such as "previously", "used to", "now", "after the fix", or descriptions of removed implementations.
- Exported library functions/classes/types that are intended for reuse outside their file/module should have concise API documentation when the signature alone is insufficient. Document purpose, parameters/type parameters, return value, observable behavior, errors/caveats, and a short example when usage is not obvious. Do not explain implementation mechanics.
- HTTP/API DTOs and response models may include third-party-facing field/validation guidance and examples.
- CQRS handlers and ordinary domain entities should not carry tutorial-style JSDoc or narrative comments. Their names, types, domain methods, and tests should explain the flow. Keep comments only for a genuinely non-obvious invariant or constraint that cannot be made clear in code.
- Internal code comments are reserved for helpers, low-level/core mechanisms, interoperability constraints, protocol requirements, concurrency/security invariants, or similarly non-obvious behavior. Keep them short and factual. Concise step markers in multi-phase core algorithms (e.g. `// 1. Validate ordering constraints`, `// 2. Validate behavior options and intent`) are helpful and encouraged. Paragraph-sized comments or tutorial explanations inside ordinary application code are a smell and belong in a README or API doc.
- **No AI slop or decorative banners in code**: Never write decorative divider lines, ASCII banners, or box borders (e.g. `// ── ... ──`, `// ===== ... =====`, `// ********************`, `/* ──────────────── */`). Keep the codebase professional and idiomatic.
- **No ticket, review, or task identifiers in code or test titles**: Never embed task IDs, issue numbers, or review finding tags (such as `(S-15)`, `S-02`, `R-07`, `JIRA-123`) in code comments, test file names, `describe`/`it` strings, function names, or variable names. Tests and code must describe the *actual domain behavior, invariant, or contract* (e.g., `describe('PipelineBootstrapService Diagnostics', ...)` and `it('fails fast when CacheBehavior precedes CaslBehavior')`, NEVER `describe('PIPELINE_BEHAVIOR_CONTRACT (S-15)', ...)`). Task IDs belong exclusively in external task-tracking/review markdown documents (`docs/reviews/`), never in source or test code.
- **No verbose narrative signposting**: Avoid conversational self-referential commentary ("This block validates...", "Here we handle...", "Helper method to..."). Code should explain itself through clean structure, with brief comments used only to label distinct technical phases or document non-obvious constraints.
- Comments must never describe a past code state or justify a completed change. Git history owns history.
- License headers, deprecation notices, generated-code markers, lint suppressions with a real reason, and externally required protocol notes are exempt from the brevity rule.

## Non-negotiable repository rules

1. CQRS handlers depend on repository/application interfaces and injection tokens, not ORM/database clients or concrete infrastructure implementations.
2. Domain/application code must not use Nest HTTP exceptions for business/application outcomes; map framework-neutral errors at the presentation boundary (e.g. `DomainException`, `EntityNotFoundException`, `ConcurrencyConflictError` mapped in `DomainExceptionFilter`).
3. Keep repeated cross-cutting concerns in pipeline behaviors when the repository provides one; handlers should remain business-focused.
4. Keep entity-level authorization and field filtering in the application path after the real aggregate/result is available.
5. Cache/idempotency short-circuit keys must include tenant, principal, and permission scope whenever those dimensions can change the final authorized response. Fail closed when required security context is absent; never silently fall back to shared `'default'` namespaces. A pipeline hit skips the handler's entity/field checks, and an outer type-level CASL check does not reproduce them. Correlation IDs are tracing metadata, not principal or permission boundaries. An idempotency key is an operation identity, not a disposable response-cache key: rotating it on permission changes can let the same effect run again.
6. Mutate aggregates through factories/domain methods, not direct setters or synthetic snapshots constructed only to trigger persistence. Aggregates inherit from our owned, framework-neutral `AggregateRoot` (NestJS 12 semantics in `@nestjs-pipeline/ddd-core/domain`). Public setters on aggregates exist strictly for MikroORM hydration (`accessor: true`), are annotated `@internal`/`@deprecated`, and `biome/plugins/aggregate-identity.grit` flags syntactic setter writes on receivers named `user`, `role`, `aggregate`, or `entity` in application layers. This naming-based lint guard cannot resolve types, aliases, or dynamic keys; domain-method mutation remains mandatory outside its coverage.
7. Keep concrete queues, JWT libraries, environment/configuration access, persistence contexts, and similar infrastructure behind application-facing ports when used by application code.
8. Follow `CommandBaseHandler` event-publication semantics for aggregate-changing commands; do not duplicate event publication.
9. Do not introduce or expand private NestJS framework API coupling casually. Existing private CQRS bootstrap usage is an accepted repository trade-off and requires compatibility reasoning/tests before changing it.
10. Do not assume Nest's in-memory EventBus is a transactional outbox. Durable delivery requires an explicit architecture decision.
11. Persistence write operations (`save()`) must use declarative lifecycle decorators in canonical outermost-to-innermost order: `@Cache(...)` -> `@AcknowledgePersisted(...)` -> `@MapPersistenceErrors(...)`.
12. Aggregate persistence acknowledgment (`acknowledgePersisted()`) must occur only after durable persistence succeeds (handled automatically by `@AcknowledgePersisted`); never advance the persisted version baseline on failed writes or uncommitted transactions.
13. Entity updates must use version-conditioned writes (`optimisticUpdate()`) requiring autocommit (`em.isInTransaction()` rejects outer transactions) and matching `WHERE id = ? AND version = expectedVersion`. Entity deletions must condition on `{ id, version: aggregate.getExpectedVersion() }` and inspect affected rows to distinguish missing entities (`EntityNotFoundException`) from concurrency conflicts (`ConcurrencyConflictError`). Persistence adapters translate ORM/driver version-conflict signals at this boundary; application/domain code must not depend on MikroORM error classes. `DomainExceptionFilter` maps `ConcurrencyConflictError` to HTTP 409. Unique-constraint and other database errors retain their own mappings.
14. Persistence lifecycle structure, conventional aggregate setter writes, and standalone package isolation are guarded by Biome Grit plugins (`biome/plugins/persistence-lifecycle.grit`, `aggregate-identity.grit`, `package-licenses.grit`, `verify-package-licenses.grit`, `test-suite.grit`); verify with `pnpm lint:persistence` and `pnpm check`.
15. Repository cache adapters (`ICache<TSnapshot>`) store strictly serializable snapshots, never live domain aggregates. `MemoryCache` enforces deep detachment parity with external caches via JSON cloning on `set()` and `get()`. Query repositories use `@FromCache({ alwaysHydrate: true, ... })` and return strictly domain aggregates (`Promise<User | null>`), requiring `hydrateFn` at decoration time and eliminating ambiguous union types (`User | UserSnapshot`) from query handlers.
16. Repository caching (`@FromCache`, persistence `@Cache`, `ICache`) and pipeline caching (`CacheBehavior`) are complementary layers and both are retained: the persistence adapter owns snapshots and repository reads because it knows the affected lookup keys and write lifecycle; the application use case owns composed results because it knows their dependencies, security scope and freshness. Do not move application composition into a repository merely to cache it, and do not require an application query class for every repository lookup. Entity invalidation does not invalidate a composed pipeline result; when both layers serve one flow, define their keys, expiry and dependencies separately.
17. Cache coordination must protect newer state from stale fills and writes. `@Cache` write-through uses CAS version comparison (`isCacheNewer`), `@FromCache` returns the newer cached snapshot when a mutation races a database read, and `MikroOrmCache` bypasses the identity map (`disableIdentityMap: true`) and deletes expired entries conditionally. Preserve these mechanisms and verify rather than assume them: their presence does not prove safety across the final-check/write gap, expiry/absence ABA, delete/recreate, secondary lookups or retry exhaustion. Per-key atomicity does not make a database commit and a cache mutation one transaction; document stale-read and failed-invalidation behavior instead of promising exactly-once or strong consistency.
18. Write-side command repositories expose authoritative aggregate loading via `IWriteSideAggregateRepository<TEntity, TId = string>` returning rehydrated domain aggregates (`Promise<TEntity | null>`) directly from primary persistence (`{ refresh: true }`) mapped with `mapPersistenceError(...)`. Command handlers depend exclusively on domain models (`User`, `Role`), never on persistence snapshots (`TSnapshot`). Anti-resurrection uses mutation barriers: `@Cache` installs a `CacheMutationBarrier` token on deletions and secondary key invalidations, and `@FromCache` runs pre/post-DB barrier checks with token validation and bounded retries (`MAX_BARRIER_RETRIES = 2`). Race defects there must be repaired and regression-tested within the abstraction, not treated as evidence that repository caching belongs in another layer.
19. Authoritative write-side loading is a freshness policy for mutations, not a ban on cached reads inside commands. Commands may read state, but only through repository/application ports — never ORM clients, never QueryBus dispatch merely to obtain data. A cached repository read is allowed where the use case explicitly tolerates that freshness; it must never replace an authoritative precondition or authorization check, since optimistic version checks guard the write, not an earlier decision or side effect taken on stale state.
20. Production code must never exist only to serve tests. No export, parameter, option, branch, or piece of retained state may be added or widened because a test needs to reach it. In particular: do not export an internal function so a spec can import it, do not add an injectable-dependency parameter whose only caller-supplied value comes from a test, and do not maintain process-global state that nothing but a test reads. Test the behavior through the surface real callers use; if that is genuinely impossible, the design is what needs changing, not the visibility. Where a module boundary must be crossed, mock the module in the test (`vi.mock`) rather than threading a seam through the signature.
21. Production and test code must remain strictly free of AI slop, decorative ASCII banners, step-by-step narration, and task/ticket references (e.g. `(S-15)`, `R-07`). Code comments are strictly reserved for non-obvious concurrency, security, or external protocol constraints. Tests describe behaviors and contracts, never ticket numbers.

## Before finishing

For architecture-sensitive work:

- compare the implementation with the positive examples listed in the architecture skill;
- run the narrowest relevant typecheck/tests plus any affected package tests;
- update architecture documentation when a deliberate repository decision changes.
