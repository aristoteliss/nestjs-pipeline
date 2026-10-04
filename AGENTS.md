# Repository Agent Instructions

These instructions apply to every agent/LLM making changes in this repository.

## The two repositories

Two sibling repositories form one product (owner, 2026-10-04). Read this before any
change that touches a package name, an export, a release or a decision the other
repository relies on.

| | ddd-cqrs | nestjs-pipeline |
| --- | --- | --- |
| Path | `~/Source/ddd-cqrs` | `~/Source/nestjs-pipeline` |
| GitHub | https://github.com/aristoteliss/ddd-cqrs | https://github.com/aristoteliss/nestjs-pipeline |
| Owns | The one implementation: the framework-neutral `@cqrs-ddd/*` packages, published from 0.5.0, and every use of them without NestJS (the example application `api/` on Express and Fastify, `integration/`); the documentation site https://aristoteliss.github.io/ddd-cqrs/; the local registry `tools/local-registry/` | The complete NestJS example of the packages: `api/`, a NestJS application on official `@nestjs/cqrs` that installs the `@cqrs-ddd/*` packages from 0.5.0; the old `@nestjs-pipeline/*` packages, stopped at 0.4.x and kept on npm with every version |
| Active task | `.claude/tasks/cqrs-ddd-pipeline.md` (the 0.5.0 release) | `.claude/tasks/adopt-cqrs-ddd-packages.md` (`api` on `@cqrs-ddd`, the README notices) |

How they connect:

- **NestJS stays NestJS here** (owner, 2026-10-04). `api` uses all of NestJS and of
  `@nestjs/cqrs`: modules, dependency injection, controllers, `CommandBus`, `QueryBus`,
  `EventBus`, `@CommandHandler`, `@QueryHandler`, `@EventsHandler`, `EventPublisher`. The
  `@cqrs-ddd` packages only add what NestJS does not have (the pipeline behaviors, the DDD
  building blocks) and replace nothing; `@cqrs-ddd/cqrs`, the framework-free buses, is not
  used here. The glue between them (wrapping each handler with its pipeline at startup,
  one exception filter that answers every package error as a NestJS `HttpException`,
  correlation and job-context wiring) is `@cqrs-ddd/nestjs`, built and published from
  ddd-cqrs (owner, 2026-10-04); `api` installs it and provides the behaviors from its own
  modules. `packages/cqrs-ddd` here publishes `@nestjs-pipeline/cqrs-ddd`, a facade that
  only re-exports it.
- **Package code lives only in ddd-cqrs.** nestjs-pipeline installs the packages and never
  copies or patches their code; a missing feature or a bug found there is fixed in
  ddd-cqrs.
- **Dependencies point one way:** nestjs-pipeline depends on `@cqrs-ddd/*`; no
  `@cqrs-ddd` package imports `@nestjs-pipeline/*`, and only the adapter
  `@cqrs-ddd/nestjs` imports NestJS (ddd-cqrs `AGENTS.md`, rule 1).
- **Before anything is published,** nestjs-pipeline installs the packages from the local
  registry: Verdaccio in Docker, `~/Source/ddd-cqrs/tools/local-registry/`, on
  `http://127.0.0.1:4873/`, whose README holds every command. A fix in ddd-cqrs is
  republished there and tested again in nestjs-pipeline.
- **Package names.** `@nestjs-pipeline/core` continues as `@cqrs-ddd/pipeline` (the engine,
  `@UsePipeline`, `@SkipPipeline`); its NestJS wiring has no successor package, `api` holds
  it;
  `@nestjs-pipeline/<name>` continues as `@cqrs-ddd/pipeline-<name>`. `@cqrs-ddd/core`,
  `mikro-orm`, `uuidv7`, `safe-stringify` and `untyped`, published from nestjs-pipeline up
  to 0.4.2, are published from ddd-cqrs from 0.5.0.
- **The old packages stay.** Versions 0.1 to 0.4 of `@nestjs-pipeline/*` are never
  unpublished or deprecated; a README notice, on GitHub and on npm through a README-only
  0.4.3, points to `@cqrs-ddd` 0.5.0.
- **Release order:** `@cqrs-ddd` 0.5.0 from ddd-cqrs first, so every link resolves; then
  nestjs-pipeline's changes; then the 0.4.3 notices. The owner publishes and pushes;
  agents commit only after asking, never on `master`.
- **Keep both sides current.** When work in one repository changes something the other
  relies on, update the other repository's active task file in the same session.

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

The repository's current code and documentation are authoritative, except for the code of the `@cqrs-ddd/*` packages, whose source of truth is ddd-cqrs from 0.5.0 (see The two repositories). Generic Clean Architecture, DDD, CQRS, NestJS, or TypeScript guidance is secondary. If external advice conflicts with an intentional repository decision, follow the repository and document any proposed architectural change explicitly.

## Working discipline

These rules bias toward caution over speed. For trivial tasks, use judgment. Where they
touch library scope, "Library scope and review discipline" below governs.

### Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs. Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, name what is confusing, and ask.

### Simplicity first

Write the minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask: would a senior engineer call this overcomplicated? If yes, simplify.

### Surgical changes

Touch only what you must. Clean up only your own mess. When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match the existing style, even if you would do it differently.
- If you notice unrelated dead code, mention it; don't delete it.

When your changes create orphans, remove the imports, variables, and functions that
*your* changes made unused. Don't remove pre-existing dead code unless asked.

Every changed line should trace directly to the request.

### Goal-driven execution

Define success criteria and loop until they are verified. Turn tasks into verifiable goals:

- "Add validation" → write tests for invalid inputs, then make them pass.
- "Fix the bug" → write a test that reproduces it, then make it pass.
- "Refactor X" → ensure tests pass before and after.

For multi-step tasks, state a brief plan with a check per step:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria allow independent iteration; weak ones ("make it work") need
constant clarification.

These rules are working when diffs carry fewer unnecessary changes, fewer rewrites stem
from overcomplication, and clarifying questions come before implementation rather than
after mistakes.

## Repository context files

`CLAUDE.md` (root) holds the durable working instructions for coding agents, and
`.claude/codebase-map.md` is the compact orientation map: repository shape, stack, entry
points, directory responsibilities, verified commands, critical modules and gotchas.
Nested `CLAUDE.md` files under `packages/`, `packages/pipeline/`, `packages/ddd-core/` and
`api/` carry the local rules for those areas; the `packages/*` rules govern the 0.4.x line,
which receives fixes only.

The map is an index, not an authority: verify any claim against the source before relying
on it, and prefer the code when they disagree. Regenerate the generated sections with
`pnpm context:update`, update the human-owned sections by hand, and verify with
`pnpm context:validate`. Never place secret values in a context or task file.
The root `README.md` section "Agent context files" documents the whole system.

## Library scope and review discipline

`packages/*` are reusable libraries for external applications and future use cases (the
0.4.x line here; from 0.5.0 their successors live in ddd-cqrs, where `@cqrs-ddd/core`
provides the reusable DDD primitives), and `api` is one example, not the product boundary. Evaluate a feature against its contract, extension purpose,
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
- Every published npm package and major runnable/core area that needs consumer guidance must have a page on the documentation site (`docs/src/content/docs/`) covering purpose, installation/setup, public API, configuration, expected behavior, caveats, and practical examples. A package README stays short: what the package is, its installation and requirements, and links to its guide and API reference; the root README holds repository information.
- Documentation pages and READMEs are current-state manuals. Prefer "use X when..." and "X behaves..." over migration narratives such as "previously", "used to", "now", "after the fix", or descriptions of removed implementations.
- Every exported function, and every public method of an exported service, adapter or helper class, has a JSDoc block that is genuinely useful: what it does beyond what its name says, each parameter (units, accepted values, required context), the return value, errors and caveats, and an `@example` of a real call. This applies to published packages and to `api` alike. A block that only restates the name or signature does not meet this rule; it is slop. Do not explain implementation mechanics. A method that implements a documented interface member is covered by that interface's doc. CQRS handlers, commands, queries, controllers and domain entities follow the rules below instead.
- Exported types and interface members get a doc comment only for what the type cannot say: units, the meaning of an absent or empty value, a security or ordering constraint.
- HTTP/API DTOs and response models may include third-party-facing field/validation guidance and examples.
- CQRS handlers, commands, queries and ordinary domain entities carry no inline comments and no narrative JSDoc. They are meant to read plainly: when the flow is hard to follow, rename, extract or simplify instead of commenting, and state invariants in test names.
- Inline comments belong only inside difficult, exceptional core mechanisms (pipeline internals, persistence lifecycle, cache coordination, concurrency or protocol handling), where they help a reader follow the internal flow or state a non-obvious concurrency, security or protocol constraint. Keep them short and factual. Concise step markers in multi-phase core algorithms (e.g. `// 1. Validate ordering constraints`, `// 2. Validate behavior options and intent`) are helpful and encouraged. Ordinary application code — handlers, controllers, mappers, services with a plain flow — has none; if it seems to need one, make the code clearer. Paragraph-sized comments or tutorial explanations belong in a README or an exported function's JSDoc.
- **No AI slop or decorative banners in code**: Never write decorative divider lines, ASCII banners, or box borders (e.g. `// ── ... ──`, `// ===== ... =====`, `// ********************`, `/* ──────────────── */`). Keep the codebase professional and idiomatic.
- **No ticket, review, or task identifiers in code or test titles**: Never embed task IDs, issue numbers, or review finding tags (such as `(S-15)`, `S-02`, `R-07`, `JIRA-123`) in code comments, test file names, `describe`/`it` strings, function names, or variable names. Tests and code must describe the *actual domain behavior, invariant, or contract* (e.g., `describe('PipelineBootstrapService Diagnostics', ...)` and `it('fails fast when CacheBehavior precedes CaslBehavior')`, NEVER `describe('PIPELINE_BEHAVIOR_CONTRACT (S-15)', ...)`). Task IDs belong exclusively in task-tracking documents (such as `.claude/tasks/`), never in source or test code.
- **No verbose narrative signposting**: Avoid conversational self-referential commentary ("This block validates...", "Here we handle...", "Helper method to..."). Code should explain itself through clean structure, with brief comments used only to label distinct technical phases or document non-obvious constraints.
- Comments must never describe a past code state or justify a completed change. Git history owns history.
- License headers, deprecation notices, generated-code markers, lint suppressions with a real reason, and externally required protocol notes are exempt from the brevity rule.

## Naming

Good names are short and declarative. A long name is a code smell: it usually repeats its context, or the thing it names does too much.

- Use the shortest name that is unambiguous in its scope. The enclosing module, class, type or function is part of the name: `sessionService.save(...)`, not `saveSession`; `auth.expiresAt`, not `auth.sessionExpiresAt`; `policy.embedPermissions`, not `policy.permissionsInAccessToken`; `user.email`, not `user.userEmail`. Qualify only when two values in one scope would otherwise collide (`accessTokenExpiresAt` beside `sessionExpiresAt` in one result).
- No prefix or suffix the declaration or its context already states: no type or layer words (`userObj`, `dataList`, `…Impl`, `…Manager`, `…Helper`, `…Util`), no history or status words (`legacy`, `old`, `new`, `v2`, `temp`). The architectural role suffixes (`…Command`, `…Handler`, `…Query`, `…Event`, `…Dto`, `…Mapper`, `…Repository`, `…Exception`/`…Error`) and the `I` prefix of application ports stay, because they name the role.
- A name states what the thing is or does, and stays true to its behavior: a command that revokes a session is not `Delete…`.
- Booleans read as yes/no statements (`isExpired`, `hasPipeline`, `includeStack`, `embedPermissions`), never as a bare noun phrase and never negated (`notEnabled`).
- Functions and methods are verbs (`revoke`, `issue`, `hash`); values and types are nouns; converters are `to…`/`from…`.
- One concept, one name, in every layer; one name never means two things.
- A unit is the one suffix that earns its length: a duration held in a bare `number` names its unit (`ttlMs`, `graceSeconds`); a number named `…At` is Unix milliseconds unless the name says otherwise (`expSeconds`).
- Abbreviate only what every reader knows (`id`, `ip`, `url`, `jwt`, `ttl`, `dto`) or the repository already uses (`em`, `ctx`).
- Do not lengthen a name to carry what its JSDoc should say, and do not rename a good name to avoid writing that JSDoc. Renaming a published export or injection token is a breaking change.
- Files are kebab-case with their role suffix, in the folder of that role inside their feature module: `application/cqrs/commands/create-user.handler.ts`, `domain/events/user-created.event.ts`, `decorators/refresh-token.decorator.ts`, `application/ports/session-cookies.port.ts`. Code shared by several modules lives in `src/common/`.

## Non-negotiable repository rules

1. CQRS handlers depend on repository/application interfaces and injection tokens, not ORM/database clients or concrete infrastructure implementations.
2. Domain/application code must not use Nest HTTP exceptions for business/application outcomes; map framework-neutral errors at the presentation boundary (e.g. `DomainException`, `EntityNotFoundException`, `ConcurrencyConflictError` mapped in `DomainExceptionFilter`).
3. Keep repeated cross-cutting concerns in pipeline behaviors when the repository provides one; handlers should remain business-focused.
4. Keep entity-level authorization and field filtering in the application path after the real aggregate/result is available.
5. Cache/idempotency short-circuit keys must include tenant, principal, and permission scope whenever those dimensions can change the final authorized response. Fail closed when required security context is absent; never silently fall back to shared `'default'` namespaces. A pipeline hit skips the handler's entity/field checks, and an outer type-level CASL check does not reproduce them. Correlation IDs are tracing metadata, not principal or permission boundaries. An idempotency key is an operation identity, not a disposable response-cache key: rotating it on permission changes can let the same effect run again. An idempotent operation may therefore keep a stable key only when replay carries an equivalent fail-closed scope check — a stored authorization digest compared before any completed response is returned, refusing a mismatch and refusing a record that has none. Without that check the key itself is the only guard, and the two safe-looking options are both wrong: binding permissions into the key duplicates the side effect, while replaying across a permission change returns a response the caller is no longer entitled to. Scope equality is valid only for the decisions the captured context represents; an operation whose authorization depends on resource state that changes later needs an explicit replay-authorization hook or must not replay results at all.
6. Mutate aggregates through factories/domain methods, not direct setters or synthetic snapshots constructed only to trigger persistence. Aggregates inherit from our owned, framework-neutral `AggregateRoot` (NestJS 12 semantics in `@cqrs-ddd/core/domain`). Aggregate setters are `private` and exist only for MikroORM hydration (`accessor: true`), so application code cannot assign them. `biome/plugins/aggregate-identity.grit` also flags syntactic property writes on receivers named `user`, `role`, `aggregate`, or `entity` in application layers. This naming-based lint guard cannot resolve types, aliases, or dynamic keys; domain-method mutation remains mandatory outside its coverage.
7. Keep concrete queues, JWT libraries, environment/configuration access, persistence contexts, and similar infrastructure behind application-facing ports when used by application code. The current tenant is not such infrastructure: it lives in `@cqrs-ddd/pipeline-tenant`, and code that needs it calls `requireTenant(purpose)` from `@cqrs-ddd/core/application`, which fails closed with `MissingTenantContextError`. Do not wrap it in a port, and do not import a persistence tenant context (such as `TenantSchemaContext`) into application code.
8. Aggregate-changing commands publish events the NestJS way: `this.publisher.mergeObjectContext(aggregate)` (`EventPublisher` from `@nestjs/cqrs`), persist, then `await aggregate.commit()` once; do not publish events any other way.
9. Do not introduce or expand private NestJS framework API coupling casually. Existing private CQRS bootstrap usage is an accepted repository trade-off and requires compatibility reasoning/tests before changing it.
10. Do not assume Nest's in-memory EventBus is a transactional outbox. Durable delivery requires an explicit architecture decision.
11. Persistence write operations (`save()`) must use declarative lifecycle decorators: `@PersistedWrite(...)` when the aggregate is the first argument and the write acknowledges, otherwise the individual decorators in canonical outermost-to-innermost order: `@Cache(...)` -> `@AcknowledgePersisted(...)` -> `@MapPersistenceErrors(...)`. Never combine the two forms on one method.
12. Aggregate persistence acknowledgment (`acknowledgePersisted()`) must occur only after durable persistence succeeds (handled automatically by `@AcknowledgePersisted`); never advance the persisted version baseline on failed writes or uncommitted transactions.
13. Entity updates must use version-conditioned writes (`optimisticUpdate()`) requiring autocommit (`em.isInTransaction()` rejects outer transactions) and matching `WHERE id = ? AND version = expectedVersion`. Entity deletions must condition on `{ id, version: aggregate.getExpectedVersion() }` and inspect affected rows to distinguish missing entities (`EntityNotFoundException`) from concurrency conflicts (`ConcurrencyConflictError`). Persistence adapters translate ORM/driver version-conflict signals at this boundary; application/domain code must not depend on MikroORM error classes. `DomainExceptionFilter` maps `ConcurrencyConflictError` to HTTP 409. Unique-constraint and other database errors retain their own mappings.
14. Persistence lifecycle structure, conventional aggregate property writes, and standalone package isolation are guarded by Biome Grit plugins (`biome/plugins/persistence-lifecycle.grit`, `aggregate-identity.grit`, `package-licenses.grit`, `verify-package-licenses.grit`, `test-suite.grit`); verify with `pnpm lint:persistence` and `pnpm check`.
15. Repository cache adapters (`ICache<TSnapshot>`) store strictly serializable snapshots, never live domain aggregates. `MemoryCache` enforces deep detachment parity with external caches via JSON cloning on `set()` and `get()`. Query repositories return strictly domain aggregates (`Promise<User | null>`), eliminating ambiguous union types (`User | UserSnapshot`) from query handlers: declare the hydrator once as the repository's `QueryRepository` hydration policy (every hit is rehydrated), or per method with `@FromCache({ alwaysHydrate: true, hydrateFn, ... })`, which is validated at decoration time.
16. Repository caching (`@FromCache`, persistence `@Cache`, `ICache`) and pipeline caching (`CacheBehavior`) are complementary layers and both are retained: the persistence adapter owns snapshots and repository reads because it knows the affected lookup keys and write lifecycle; the application use case owns composed results because it knows their dependencies, security scope and freshness. Do not move application composition into a repository merely to cache it, and do not require an application query class for every repository lookup. Entity invalidation does not invalidate a composed pipeline result; when both layers serve one flow, define their keys, expiry and dependencies separately.
17. Cache coordination must protect newer state from stale fills and writes. `@Cache` write-through uses CAS version comparison (`isCacheNewer`), `@FromCache` returns the newer cached snapshot when a mutation races a database read, and `MikroOrmCache` bypasses the identity map (`disableIdentityMap: true`) and deletes expired entries conditionally. Preserve these mechanisms and verify rather than assume them: their presence does not prove safety across the final-check/write gap, expiry/absence ABA, delete/recreate, secondary lookups or retry exhaustion. Per-key atomicity does not make a database commit and a cache mutation one transaction; document stale-read and failed-invalidation behavior instead of promising exactly-once or strong consistency.
18. Write-side command repositories expose authoritative aggregate loading via `IWriteSideAggregateRepository<TEntity, TId = string>` returning rehydrated domain aggregates (`Promise<TEntity | null>`) directly from primary persistence (`{ refresh: true }`) mapped with `mapPersistenceError(...)` (`@cqrs-ddd/mikro-orm`). Command handlers depend exclusively on domain models (`User`, `Role`), never on persistence snapshots (`TSnapshot`). Anti-resurrection uses mutation barriers: `@Cache` installs a `CacheMutationBarrier` token on deletions and secondary key invalidations, and `@FromCache` fills only through a revision-fenced `IVersionedCache` (`tryFill` commits only if nothing advanced the key's revision during the database read, with bounded retries); an adapter exposing only `get`/`set` is bypassed for both reads and fills rather than degraded to an unfenced fill. Race defects there must be repaired and regression-tested within the abstraction, not treated as evidence that repository caching belongs in another layer.
19. Authoritative write-side loading is a freshness policy for mutations, not a ban on cached reads inside commands. Commands may read state, but only through repository/application ports — never ORM clients, never QueryBus dispatch merely to obtain data. A cached repository read is allowed where the use case explicitly tolerates that freshness; it must never replace an authoritative precondition or authorization check, since optimistic version checks guard the write, not an earlier decision or side effect taken on stale state.
20. Production code must never exist only to serve tests. No export, parameter, option, branch, or piece of retained state may be added or widened because a test needs to reach it. In particular: do not export an internal function so a spec can import it, do not add an injectable-dependency parameter whose only caller-supplied value comes from a test, and do not maintain process-global state that nothing but a test reads. Test the behavior through the surface real callers use; if that is genuinely impossible, the design is what needs changing, not the visibility. Where a module boundary must be crossed, mock the module in the test (`vi.mock`) rather than threading a seam through the signature.
21. Production and test code must remain strictly free of AI slop, decorative ASCII banners, step-by-step narration, and task/ticket references (e.g. `(S-15)`, `R-07`). Exported functions and the public methods of exported classes carry useful JSDoc with an `@example`; a comment that restates a name is slop. Inline comments appear only inside difficult core mechanisms, to follow their internal flow or state a non-obvious concurrency, security or protocol constraint — never in CQRS handlers or other ordinary application code. Tests describe behaviors and contracts, never ticket numbers.
22. Names are short and declarative, with no prefix or suffix their context already gives; a long name is a code smell. Follow the Naming section above.
23. Every external system an application connects to (Redis, the database, the OTLP collector, a broker, a third-party API) has exactly one standalone config module, `<system>.config.ts`, exporting a function such as `redisConfig()` that reads that system's environment variables, applies defaults, validates them (failing at startup on an invalid value) and returns typed settings. It is the single source of truth: module wiring, CLI commands, adapters and tests take the connection settings from it, and no other file reads those variables or rebuilds a URL from them. Published packages read no environment at all (`core-environment.grit`); they take configuration through module options, which the application fills from its config module.

## Before finishing

For architecture-sensitive work:

- compare the implementation with the positive examples listed in the architecture skill;
- run the narrowest relevant typecheck/tests plus any affected package tests;
- update architecture documentation when a deliberate repository decision changes.
