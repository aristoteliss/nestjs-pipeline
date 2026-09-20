# LLM Agent Implementation Brief

**Review source of truth:** `docs/reviews/Final.Review.md`

This file is the executable implementation companion to the Final Review. It translates approved findings into implementation steps; it does not redefine review conclusions or authorize decision-gated work. The current code, `AGENTS.md`, and `.agents/skills/nestjs-pipeline-architecture/SKILL.md` remain authoritative for runtime and architecture contracts.

Read `AGENTS.md` and the architecture skill before editing. Implement one finding per reviewable change, with its focused regression tests. Do not merge several findings into a framework rewrite. Preserve public behavior unless a migration is explicitly required below.

**Scope and compatibility.** Both cache layers and the persistence lifecycle decorators stay. The example application does not define the public product surface. Before deleting an export, supported type, adapter or overload, identify its documented contract, external-consumer impact and an actual maintenance or correctness cost. A local reference search cannot prove a published API has no consumers. Never fix a failing regression by weakening tenant isolation, entity authorization, optimistic concurrency, ownership-aware idempotency completion or mutation detachment.

**Verification per change.** Use package-scoped checks while iterating (`pnpm --filter <pkg> test`, `pnpm --filter <pkg> lint`). At completion run `pnpm check`, `pnpm lint:persistence`, the affected workspace suites, and the relevant users-api E2E. Run `pnpm test:release` for any published-surface change. If E2E infrastructure is unavailable, state that limitation instead of claiming coverage.

---

# Current task scope — CASL package and supported public compatibility

Follow the 2026-09-22 current-disposition section of [Final.Review.md](Final.Review.md) and the evidence in [CASL.v2.Commit.Review.md](CASL.v2.Commit.Review.md). Preserve the CASL architecture. The users-api authentication findings are separate application findings and are not implementation tasks in this package follow-up. Unrelated historical backlog below is retained for reference, not implicitly authorized.

## C2-01 — Root-array projection contract

1. Reproduce through exported `buildAbility` and `CaslAuthorizer.project`: an unrestricted `User` read with candidate `[{ id: 'one' }]` currently returns `{ '0': { id: 'one' } }`, although the declared return type is an array.
2. Repair root-array shape within the projection abstraction. Define/test root index paths consistently with nested array masking; preserve null placeholders, readonly input support, nonmutation, condition evaluation against the supplied subject, cycle protection and parent-grant inheritance.
3. Test empty arrays, allowed and denied indices, nested arrays and inferred return types. Do not export internals or add test-only options. Array-shape support does not authorize separate entities automatically; collections still require per-entity checks.
4. Prefer preserving the accepted public input domain. If choosing record-only input instead, stop for the explicit API decision before narrowing supported inputs; the documentation update does not authorize that breaking alternative.
5. Run CASL tests/typecheck, `pnpm check`, `pnpm lint:persistence`, and `pnpm test:release`. Close C2-01 only when the regression asserts the intended array result.

## C2-02 — Public compatibility and release preparation

Compare `3fc81b858dd4d7e139fb662307a5ffdef3a06675` with the proposed release. Inspect in this order: **core, correlation, OpenTelemetry, Zod, CASL**. Exclude deep imports/internal contracts, including `setCorrelationFallback`, internal setters and bootstrap implementation. Do not expand into other workspaces.

- Core: document removal of `originalCorrelationId`, read-only `correlationId`, and logger-provider type narrowing. Verify ordinary factory/runner and custom behavior examples.
- Correlation: cover `addCorrelationId()` plain-object acceptance and rejection of class instances. Do not classify its internal fallback setter removal as a supported API break.
- OpenTelemetry: preserve existing tracing options; distinguish changed Nest/core peer requirements from API removal. No removed supported export was identified in this review.
- Zod: migrate `ZOD_SCHEMA` imports, direct synchronous pipe calls, and assumptions that validation leaves the raw request untouched.
- CASL: migrate provider configuration, public imports, `buildAbility` arguments, behavior options and permission precedence. Do not remove field/entity checks when replacing old request-derived options.

Record versions and peer compatibility separately from code defects. The reviewed manifests use CASL `0.2.0`, core `0.1.19`, correlation/OpenTelemetry `0.1.9`, and Zod `0.1.7`; recommending a separate pre-1.0 minor release line is not authorization to change or publish versions. Check registry status before an authorized release. Do not claim the packed new-code suite proves compatibility for an unchanged old consumer; add representative public-consumer compile/runtime fixtures if implementing compatibility guarantees.

**Evidence:** the earlier review runs passed CASL 165, users-api 709, targeted e2e 33, typechecks, lint and packed release verification. Temporary defect probes were removed. This documentation sync does not rerun or expand that coverage. Follow `.claude/README.md`: start a task file, update milestones, regenerate the map, validate, and retire completed task files.

---

# 1. Closed items — do not reopen

| ID | What closed it |
|---|---|
| ~~E-01~~ | `integration/packages/release.mjs` discovers non-private packages, packs them, checks archive identity and contents, installs into an isolated consumer, and runs generated TypeScript/runtime imports plus the core lifecycle and CASL 7 fixtures. Coverage limits are documented in `integration/packages/README.md`. CASL advertises `@casl/ability ^7.0.0`; CASL 6 is out of the advertised peer contract by owner decision. |
| ~~E-02~~ | `AGENTS.md` rule 13 and the architecture skill both describe the framework-neutral contract: persistence adapters surface version conflicts as `ConcurrencyConflictError`, application and domain code stay independent of MikroORM error classes, presentation maps 409, missing rows stay `EntityNotFoundException`, unique-constraint errors keep their own mapping. No production error behavior changed. |
| ~~F-02~~ | The correlation-scoped `defaultCacheKey` was removed. `CacheBehavior` declares a bootstrap contract that rejects an active cache declaration without a key, and `createPartitionedCacheKeyFactory` fails closed on missing tenant or principal. Residual documentation drift is tracked as N-02. |
| ~~F-03~~ | `IdempotencyBehavior` releases the claim only when `next()` throws. Snapshot and completion-store failures retain the claim and raise `IdempotencyCompletionError` carrying a `snapshot` or `store` phase. |
| ~~F-08~~ | `getBehaviorId()` returns the constructor reference; `PIPELINE_BEHAVIOR_ID` remains an opt-in stable string for duplicated package copies. |
| ~~F-10~~ | Superseded by CASL v2: `CaslAuthorizer` has only `can`, void `authorize` and `project`; the old actor/bypass overloads are absent. |
| ~~S-01~~ | `@SkipPipeline(...behaviors)` with `PIPELINE_SKIPPED_BEHAVIORS_METADATA`, `BehaviorId` filtering before DI resolution, preserved chain order, command/query/event and singleton/scoped support, and bootstrap failure on a contradictory skip plus local re-add. |
| ~~S-02~~ | Typed intent builders in seven packages: `requires`, `rateLimit`, `idempotent`, `cache`, `featureFlag`, `audit`, `resilience`. They return the existing `PipelineBehaviorEntry` tuple and require activation fields; raw tuples remain valid. |
| ~~S-15~~ | `PIPELINE_BEHAVIOR_CONTRACT` with per-behavior `validate`/`order` hooks, implemented by the cache, rate-limit, idempotency, feature-flag and resilience behaviors, with strict/warn/off diagnostics and a users-api integration spec. |
| ~~S-08 / A-01 / U-10~~ | Superseded, not implemented. `ddd/users-api/src/users/cqrs/queries/get-user-overview.handler.ts` is a real production `CacheBehavior` consumer, so the users-api `CacheModule` registration is live wiring. Do not remove it. Its entity/field authorization is implemented; N-01 is closed. |
| ~~A-04 / U-09~~ | No semantic no-op `@MapPersistenceErrors({ unique: [] })` invocation remains in users-api. |
| ~~D-02~~ | Resolved: `AggregateRoot` with NestJS 12 semantics is owned in `ddd/core/domain`; the domain entry point loads no `@nestjs/*` and no `@mikro-orm/*`, enforced by `domain-entry-point.spec.ts`. **Do not treat D-02 as an open decision.** |
| ~~D-03~~ | Resolved: direct `accessor: true` mapping retained, hydration setters annotated `@internal`/`@deprecated`, `biome/plugins/aggregate-identity.grit` rejecting dot and literal-bracket writes, compound assignments and updates on receivers named `user`, `role`, `aggregate`, `entity` in application layers. The guard is syntax- and naming-based only; domain-method mutation stays mandatory outside its coverage. |
| ~~F-06~~ | Replaced raw tuples with `audit({...})` intent builder, renamed `metadataFactory` to `metadata`, registered trusted session actor factory as `AuditModule.forRoot` defaults (`AUDIT_MODULE_DEFAULTS`), added compile-time tests rejecting unknown options, and verified emitted records in `deletion-audit-records.spec.ts`. |
| ~~F-07~~ | Hand-written deep equality over Sets fixed in `packages/pipeline-zod/src/helpers/zod-data.helpers.ts` via one-to-one consumption matching in `equalData`, guaranteeing symmetry, order independence, cycle safety, and correct multiplicity handling. Verified by regressions in `zod-data.helpers.spec.ts` and `zod-validation.regressions.spec.ts` (commit `dc6b1499`). |
| ~~F-05~~ | Coordinated mutation lifecycle and domain events via `@Mutable` backing fields and `@ApplyMutation<TEntity>({ event })` method decorator. Methods validate and return patches; `@ApplyMutation` applies patches, runs `onUpdate()` (advancing version & `updatedAt`), and constructs domain events from post-mutation snapshot. Public aggregate methods retain fluent `return this` wrapping protected patch methods. Pre-application checks abort before state change; unexpected post-application failures propagate without automated rollback. Biome Grit plugin `domain-mutation.grit` enforces conventions and rejects legacy `@Mutate`. Verified in `ApplyMutation.spec.ts`, `user.entity.spec.ts`, and `role.entity.spec.ts`. |

---

# 2. Correctness and security track

Implement in this order. Each item must ship with a regression that fails before the fix and passes after it.

## 2.1 F-06 — Audit options that are silently ignored
 
**Status: CLOSED. Done.** Both deletion handlers use the `audit({...})` intent builder with the declared `metadata` option, `AUDIT_MODULE_DEFAULTS` supplies a trusted session actor resolved from the request-scoped session rather than the payload, the option literals use `satisfies AuditBehaviorOptions` so an unknown property is a compile error, and `deletion-audit-records.spec.ts` asserts the emitted record across success, failure and the no-session case.

`AuditBehaviorOptions` declares `metadata?: AuditMetadataFactory` (`packages/pipeline-audit/src/interfaces/audit-options.interface.ts:92`). `ddd/users-api/src/users/cqrs/commands/delete-user.handler.ts:38` and `ddd/users-api/src/roles/cqrs/commands/delete-role.handler.ts:38` pass `metadataFactory`, so the target id, acting user id and acting email never reach the HIGH-severity audit record.

1. Rename the option to `metadata` in both handlers, using the declared callback signature and record field types. Include the target identifier and intended action metadata; do not serialize full entities or secrets.
2. Configure a trusted actor factory, preferably once in the application `AuditModule` defaults if all audited requests share the same principal context. Define anonymous/system behavior explicitly rather than inventing an authenticated actor.
3. Extract the option literals into constants with `satisfies AuditBehaviorOptions` so an unknown property becomes a compile error. Apply the same local pattern to the other built-in behavior options touched by this track. Do not redesign the decorator generic system to catch one typo.
4. Add compile-time coverage proving an unknown property such as `metadataFactory` is rejected in a typed option literal.
5. Add a focused runtime test using the real decorated handler metadata and the actual `AuditBehavior` with a fake sink, asserting action, actor, tenant and target metadata in the emitted record. Test both success and the configured failure-record policy, and verify the actor factory does not trust a caller-supplied body field.

**Acceptance:** no `metadataFactory` usage for `AuditBehavior`; both deletion handlers produce the intended record with actor and target; tests assert the emitted record, not the presence of a decorator entry.

## 2.2 F-07 — Deep equality returns the wrong answer for Sets

**Status: CLOSED. Done.** Applied one-to-one consumption matching for Sets and Maps in `equalData` (`packages/pipeline-zod/src/helpers/zod-data.helpers.ts`), ensuring symmetry, order independence, cycle safety, and correct multiplicity handling. Verified by regressions covering unequal multiplicities, nested collections, symmetry, and behavior-level revalidation upon mutation in `zod-data.helpers.spec.ts` and `zod-validation.regressions.spec.ts` (commit `dc6b1499`).

`packages/pipeline-zod/src/helpers/zod-data.helpers.ts:133-146` iterates the right-hand Set without consuming the matched element, so two left entries can both match one right entry. Equality decides whether a mutated command is revalidated.

1. Apply the one-to-one consumption principle already used by the Map branch immediately above: copy right-side values into an unmatched list, find one deeply equal unmatched value per left value, remove only that match, return `false` when none exists. Do not use `every(...some(...))`.
2. Preserve the helper's existing supported-value semantics. Do not substitute JSON stringification, which loses Sets/Maps/types, and do not re-run schema transforms on every invocation; the existing optimization prevents transforms running twice on an unchanged constructed command.
3. Test distinct object entries with equal shapes, unequal multiplicities, insertion-order independence, nested Sets and Maps, equal primitives, and symmetry (`equal(a,b) === equal(b,a)`) across the supported acyclic domain.
4. Add a behavior-level regression: a validated command carrying a Set of `{n:1}` and `{n:2}` with a refinement requiring an entry whose `n` is 2; mutate the second object to `{n:1}` without changing the Set size; the pipeline must detect the changed snapshot, revalidate, reject, and never invoke the handler. Assert an unchanged transformed command does not run its transform twice.
5. Document the clone/equality supported domain. If cyclic values are outside it, reject them with a clear error before recursive overflow rather than claiming arbitrary-object support.

**Acceptance:** the reproduced Sets compare unequal in both directions; the mutated request is rejected at the behavior level; normal object commands, async refinements, defaults and once-only transforms are unchanged.

## 2.3 F-05 — Mutation events carry the previous version and timestamp

**Status: CLOSED. Done.** Coordinated mutation lifecycle and domain events via `@Mutable` backing fields and `@ApplyMutation<TEntity>({ event })` method decorator. Aggregate version 2 produces a mutation-event payload at version 2, rejected mutations emit nothing and do not increment version, and optimistic writes preserve baseline expected version. Pre-application checks (patch validation, field normalizers, callable lifecycle methods) abort before state changes; unexpected post-application failures propagate without automated rollback; public aggregate methods retain fluent `return this` signatures delegating to protected patch methods; Biome Grit plugin `domain-mutation.grit` enforces conventions and rejects legacy `@Mutate`. Legacy `@Mutate` decorator removed as an accepted breaking change.

`@Mutate` (`ddd/core/domain/decorators/Mutate.ts:31-52`) invokes the method and only then calls `onUpdate()`, which increments `_version` and refreshes `_updatedAt` (`root.entity.ts:301-311`). The method has already constructed the event, and `RootDomainEvent`'s constructor snapshots `entity.version` and `entity.toJSON()` at that moment (`root-domain.event.ts:174-196`).

Land this before S-03 and S-04, which touch the same methods.

1. Change concrete aggregate mutation methods to explicit ordering: validate all inputs and preconditions; apply the complete state change; invoke the protected update lifecycle exactly once; construct and apply the event from the resulting snapshot. Never increment the version before validation succeeds.
2. Remove `@Mutate` from those concrete methods so it cannot perform a second increment. Inventory other uses before removing the decorator export; it is a reusable DDD contract even though the workspace is private. Preserve or deprecate its export explicitly — lack of example usage is not sufficient grounds for removal.
3. Preserve factory/create semantics: a newly created aggregate starts at its existing initial version, and `getExpectedVersion()` stays the persisted baseline until a durable save acknowledges the new version. The event's version must not become the write predicate's expected version.
4. Treat delete methods explicitly. If deletion currently advances the version to describe a domain mutation, preserve that event version while the delete repository still predicates on the persisted baseline. Do not change deletion concurrency semantics as a side effect.
5. Keep `CommandBaseHandler` responsible for publication after successful handling and persistence. Do not publish inside the domain method and do not add an outbox here.
6. Test update, rename, delete, consecutive mutations and rejected mutations. Compare the event payload version and timestamp with the aggregate snapshot immediately after each successful mutation. Verify earlier event snapshots stay unchanged after later mutations and that persistence acknowledgment does not rewrite an event.

**Acceptance:** aggregate version 2 produces a mutation-event payload at version 2; rejected mutations emit nothing and do not increment; optimistic writes still use the previous persisted version. Update the architecture-skill positive examples so future generated code follows the explicit ordering.

## 2.4 N-01 — Composed cached read model without entity or field authorization

**Status: CLOSED. Done.** The composed candidate is authorized by a single `project('read', user, candidate)` on the loaded aggregate, which performs the entity check and applies field and descendant masks together, so the response cannot be returned without it. Roles and additional capabilities require `read` on the `UserCapabilities` subject, evaluated against the target user's id, and fail closed for a principal granted only the profile; roles are additionally kept only when the loaded `Role` passes `read` and `read name`. The response cache key is partitioned on tenant, principal type/id from `getCaslPrincipal()`, a digest of the effective rules and the policy version, and caching is bypassed for conditional `read` rules on `User`, `Role`, `UserCapabilities` or `all`. The read declares `refresh: true`, and `overview-repository-cache-freshness.spec.ts` drives the real `GetUserQueryRepository` with a real `MemoryCache` to prove a stale cached department cannot decide access.

Response-cache freshness for conditional related resources rests on the bypass rather than on invalidation. That is the documented contract for this handler, not an outstanding item.

## 2.5 F-04 — Idempotency replay is not bound to the authorization scope

**Status: CLOSED. Done.** The operation key is stable and versioned; replay is bound separately by `replayScopeFactory`, whose digest is resolved before the claim (so absent authorization context rejects the request without claiming a key) and stored as `replayScope` on the record. Memory and Redis round-trip it through their JSON serialization; Postgres carries it as its own column, added to existing tables with `ADD COLUMN IF NOT EXISTS`. A completed record replays only on an exact match — a mismatch, a scope-less record, or a caller with no resolvable scope raises `IdempotencyConflictError` reason `replay_scope` (`409`) and the handler is neither re-executed nor the record deleted. Payload fingerprinting stays independent (`key_reuse`, `422`). In users-api the key is `v1:tenant:principalType:principalId:action:discriminator` from the trusted session, with no `'anonymous'` fallback and no payload identity, and the digest covers the effective ability rules plus the trusted principal and user context. AGENTS.md rule 5 records when a stable key is allowed.

Scope equality is valid only for the decisions the captured context represents. An operation whose authorization depends on resource state that changes after completion needs an explicit replay-authorization hook, or must not replay results; that limit is documented, not implemented.

**Migration:** the `v1:` key namespace is new, so claims stored under the previous `tenant:actor:action:id` shape no longer match. Existing deduplication windows lapse with the configured TTL, during which a previously completed operation can execute once more. Roll out around the TTL, or translate existing records, rather than treating the namespace change as invisible.

## 2.6 F-09 + S-06 — Shared optimistic delete and one autocommit contract

**Status: CLOSED. Done.** `assertAutocommit(em, operation)` in `ddd-core/persistence` is the single transaction-boundary check, reused by `optimisticUpdate`, the new `optimisticDelete`, and the create repositories before their flush/upsert. It runs before any statement is issued, so a rejected operation writes nothing, leaves `getExpectedVersion()` where it was, and performs no cache eviction or write-through.

`optimisticDelete(em, entityType, aggregate, entityName)` issues exactly one conditional delete on `{ id, version: getExpectedVersion() }`. One affected row is success; zero runs a single refreshed lookup that raises `EntityNotFoundException` when the row is gone and `ConcurrencyConflictError` when it is present; any other count is an invariant error. The entity manager is captured once by the caller and used for both statements, so the delete and the diagnostic read cannot observe different transactional state. The helper does not cache, acknowledge or publish, and a delete still resolves to `null` — there is no new snapshot to acknowledge.

Both User and Role delete repositories are migrated and now differ only in their cache keys. Unversioned Auth/session rows are deliberately out of scope and keep their own lifecycle rather than gaining a synthetic version column.

## 2.7 F-01 residual — policy for adapters without revisions

**Status: CLOSED. Done.** `@FromCache` caches only through an adapter satisfying `isVersionedCache`. An adapter exposing only `get`/`set`/`delete` is bypassed for **both** reads and fills, and the query goes to the database; the decorator logs this once per adapter instance. The unfenced get/set fill path is deleted, so a stale snapshot can no longer overwrite a deletion barrier through it.

The two alternatives in this section were weighed and rejected. Bypassing fills alone would still serve entries written before a mutation. Rejecting at configuration time would break consumers of `ICache`, a published contract that `@Cache` write-through continues to support. The bypass is non-breaking, removes the race rather than documenting it, and is observable.

Migrating the existing decorator and repository specs onto a real versioned adapter exposed one parity gap, now fixed: the versioned path hydrated a stored `null`, where the removed path treated it as a miss. `ddd/core/README.md` documents the policy and keeps the best-effort caveat — a committed write followed by an unavailable cache leaves the previous entry until expiry, and per-key compare-and-set cannot remove that dual-write window.

## 2.8 F-16 — Dead-letter classification for expected rejections (Closed)

**Status: CLOSED. Done.** `ddd/users-api/src/infrastructure/dead-letter.options.ts` owns the classification: `EXPECTED_REJECTIONS` lists the concrete rejection classes the application raises and `POST_SUCCESS_FAILURES` keeps `IdempotencyCompletionError` out of the replay queue. `ReliabilityModule` passes `DEAD_LETTER_DEFAULTS` through the existing `ignoreErrors` hook, so the reusable package needed no new predicate. Invariant and configuration failures (`AuthConfigurationException`, `MissingTenantContextError`) and unclassified errors are still captured. `dead-letter.options.spec.ts` asserts zero records for each expected rejection and the completion error, and exactly one for unexpected failures, through a real `CommandBus` with the composed command-scope override.

Verification (2026-09-21): `pnpm --filter @nestjs-pipeline/ddd-users-api test src/infrastructure/dead-letter.options.spec.ts` — **19/19 tests passed**. This verifies classification through the composed command pipeline; it does not claim durable delivery or transactional-outbox semantics.

## 2.9 F-11 — Detachment is not runtime immutability

**Status: OPEN. Reproduced.** A `deepCloneAndFreeze` result is `Object.isFrozen`, yet `Date.prototype.setTime.call(...)`, `Set.prototype.add.call(...)` and `Map.prototype.set.call(...)` all mutate the stored snapshot.

This is a contract-accuracy fix, not an exploit. Detachment from the aggregate does work; the documented promise of an "immutable state payload snapshot" does not.

1. Inventory documented and typed supported values and all consumers of `deepCloneAndFreeze`, `RootDomainEvent.payload` and `event.entity`. Treat the helper as a contract even though the workspace is private.
2. Keep deep detachment for supported objects, `Date`, `Map` and `Set`. Document that `Object.freeze` protects ordinary object properties but cannot freeze built-in internal slots. Remove universal immutability claims. If method overrides remain as ordinary-call guards, describe their limited protection accurately; do not present them as a security boundary.
3. Expose a clearly named detached-snapshot helper/contract, keeping a deprecated alias if the existing helper is renamed. Specify treatment of cycles, accessors and custom prototypes — detach them safely within the supported contract or reject them explicitly rather than retaining a hidden live getter closure.
4. For consumers requiring isolation from one another, offer an explicit copy-on-read snapshot access path backed by a private captured snapshot. Do not silently impose a cloning getter on an existing property if reference identity or performance is part of its contract.
5. Keep `event.entity` compatibility and document it as a live reference, not the captured snapshot.
6. Apply strict JSON serialization at adapters that require it — queues, persistence, transport — with explicit serializers for richer payloads. Do not force all in-memory library events through a transport restriction. Coordinate with F-05 so the captured data carries the final version.
7. Test deep detachment from the aggregate; ordinary nested-property freeze; the documented Date/Map/Set prototype-mutation behavior; isolated copies where configured; cycles and accessors per the declared contract; transport rejection or conversion of unsupported payloads.

## 2.10 F-14 — One EntityManager selection predicate

**Status: OPEN.** `mikro-orm.store.ts:72-170` and `postgres-mikro-orm.store.ts:42-140` each implement `canReuseContextManager`, `em`, `sem` and `withFork`; within the PostgreSQL store the `em` and `sem` getters are themselves near-duplicates differing only in the cast.

1. List the common decisions separately from driver-specific initialization, schema setup and connection lifecycle. Extract one small internal resolver deciding whether a candidate context EntityManager belongs to the selected ORM, driver and tenant, and obtaining a safe fallback fork.
2. Pass explicit inputs: selected ORM/config identity, expected driver, tenant schema/registry context, candidate request-context manager. Avoid a helper that implicitly reads unrelated global singletons. Return a manager of a shared supported interface or preserve the concrete generic type; do not cast a PostgreSQL manager to the libSQL concrete class to satisfy injection types.
3. Keep driver-specific bootstrap, tenant initialization and shutdown in their stores. Do not create a configurable universal database store with callbacks for every difference.
4. Make `em` and `sem` call the resolver. Remove `sem` or `withFork` only if contract analysis establishes they are internal with no supported extension purpose; a local reference inventory is insufficient. If both getters must remain, have them delegate rather than duplicate branch logic.
5. Add a shared table-driven suite over both adapters: same ORM and tenant context reused; wrong schema rejected; wrong ORM/config rejected; wrong driver rejected; absent context gets the correct fork; concurrent tenant contexts stay isolated; transaction-context cases so the refactor cannot hide an active transaction from F-09.
6. Run the existing tenant middleware/store tests and the relevant database E2E. Compare behavior, not private method names.

## 2.11 N-02, N-04 … N-07 — Documentation accuracy and hygiene (Closed)

All items closed:

- **N-02** — **Closed.** `packages/pipeline-cache/src/helpers/README.md` rewritten around the real contract: no default key, active `CacheBehavior` requires key, `createPartitionedCacheKeyFactory` fails closed. `ddd/users-api/test/docs-cache-security.spec.ts` extended to verify all three cache markdown files.
- **N-03** — **Closed.** `create-auth.handler.ts` records a pre-authentication claim rather than an identity: `claimedIdentityActor()` returns `{ authenticated: false, claimedEmail }`, so the record carries no `id` and cannot pass a filter for authenticated activity, and the `'anonymous'` fallback is gone.
- **N-04** — **Closed.** Removed review identifiers from `behavior-composition-contracts.spec.ts` and `docs-cache-security.spec.ts`. Zero review/ticket IDs remain in test titles across the workspace.
- **N-05** — **Closed.** Removed in commit 12d912c8; zero divider lines remain across packages and DDD.
- **N-06** — **Closed.** `ddd/users-api/src/persistence/cache/mikro-orm.cache.ts` logs a fixed diagnostic with a SHA-256 key digest via `this.logger.warn`, omits raw keys and parse-error messages, and records a factual comment that unparsable entry is treated as absent to heal corrupted data.
- **N-07** — **Closed.** Protected `delete-user.handler.ts` and `delete-role.handler.ts` with `cmd?.id` safe dereference so metadata factory exceptions cannot discard audit records.

## 2.12 A-09 / F-17 — Example honesty and documentation authority

- **A-09** — **Closed.** Renamed processors to `SimulatedSendWelcomeEmailProcessor` and `SimulatedBatchUpdateUsersProcessor` (with backwards-compatible aliases); removed artificial `setTimeout` delays; returned explicit simulation results (`SimulatedWelcomeEmailResult`, `SimulatedBatchUpdateResult`) and logged honest simulation demonstration statements.
- **F-17** — Make each package README authoritative for its own public API, options and defaults; keep the root README a concise overview with links. Correct test-command descriptions so it is clear which command builds, which runs unit tests, and which requires Docker, a database or Redis. Correct the resilience examples to specify handled errors and command replay safety, and the feature-flag targeting examples to match module behavior. Rename `biome/plugins/package-licenses.grit` and `verify-package-licenses.grit` to names describing import and package boundaries, updating configuration, tests and documentation references; these rules are not licence-compliance checks. Update persistence documentation only where the implementation actually changes under F-01/F-09, and state that AST checks enforce recognizable source patterns while tests and review verify commit and transaction semantics.

---

# 3. Simplification track — S-03 through S-18

**Status: IMPLEMENTABLE, subject to the order and safety constraints below.**

**Detailed evidence:** `docs/reviews/Final.Review.md`, section *Detailed simplification review*.

This track is not permission to reduce features. Its objective is to make the normal users-api-style application surface smaller and safer while preserving the existing low-level APIs as explicit escape hatches. Do not combine it with D-01.

## 3.0 Breaking-change classification

| ID | Breaking classification | Migration rule |
|---|---|---|
| ~~S-01~~ | ~~Non-breaking / additive.~~ | Shipped. |
| ~~S-02~~ | ~~Non-breaking / additive.~~ | Shipped. Raw `[Behavior, options]` tuples keep working indefinitely unless a separate breaking decision is made. |
| S-03 | **Non-breaking / additive.** | Add `@PersistedWrite` first and migrate users-api. Do not remove low-level persistence decorators as part of this item. |
| S-04 | **Potential public source break.** | Add the behavior and migrate handlers first. Removing `CommandBaseHandler` requires an intentional breaking cleanup or deprecation step. |
| S-05 | **Non-breaking.** | An abstract hook becoming a default no-op stays override-compatible. |
| S-06 | **Non-breaking / additive.** | The helper must preserve exact current optimistic-delete outcomes; see F-09 for the transaction boundary. |
| ~~S-07~~ | **Done.** | Idempotency keys keep the versioned `v1` layout, and escaping changes only the segments that could collide. Rate-limit keys changed layout; the one-time limiter reset is accepted. |
| ~~S-08~~ | ~~Users-api module composition break only.~~ | Superseded: a real `CacheBehavior` consumer exists. Do not remove the wiring. |
| S-09 | **Potential behavior/config break.** | Compare effective `LoggingBehavior` options per handler before and after; do not change log level or volume accidentally. |
| S-10 | **Non-breaking only if the observability contract is preserved.** | Keep current attribute names/values and compatibility item symbols during migration. Removing symbols or renaming attributes is a separate breaking change. |
| S-11 | **Non-breaking / additive.** | Existing async configuration forms must remain valid; the static-global form is optional. |
| S-12 | **Non-breaking if defaults are optional.** | Keep current constructors and full `@FromCache` configuration valid. |
| S-13 | **Behavioral break for stacked decorators.** | One existing `@UsePipeline` call is unchanged. Explicitly test and document the new compose-versus-overwrite behavior. |
| ~~S-14~~ | ~~Public API/source breaking only for the narrow symbols actually removed or moved.~~ | **Closed.** `PipelineBootstrapService` unexported, `originalCorrelationId` and `PIPELINE_TENANT_ID` removed. Coherent builders, serializers and adapters retained. |
| ~~S-15~~ | ~~Additive first; later strictness can be behavior-breaking.~~ | Shipped. If a formerly accepted deterministic misconfiguration later becomes a bootstrap error, document that policy change. |
| ~~S-16~~ | **Non-breaking / additive.** | Closed. Raw `context.items` is unchanged; typed tokens layer on top. |
| S-17 | **Non-breaking / additive.** | Presets expand to existing pipeline entries; `@UsePipeline` remains available. |
| S-18 | **Non-breaking.** | Internal decomposition only. Public decorators and module configuration stay identical; existing lifecycle tests become characterization tests. |

The implementation agent optimizes for one obvious normal path, typed declarative intent, safe defaults, first-class per-handler exceptions, no duplicated security-sensitive key mechanics, no behavior or persistence ordering knowledge in ordinary application code, and unchanged advanced capability.

## 3.1 S-16 — Typed pipeline context items (Closed)

**Status: CLOSED.** Core exports `PipelineItemToken<T>`, `createPipelineItem`,
`getPipelineItem`, `setPipelineItem`, `requirePipelineItem`, `hasPipelineItem`,
and `MissingPipelineItemError`. Default keys are unique symbols; explicit keys
wrap existing strings and symbols without changing identity. No registry or DI
system is involved, and `IPipelineContext.items` remains unchanged.

Token-based reads infer the value type; writes use `NoInfer<T>` to reject values
that would widen it. Required reads reject absent or undefined entries and name
the item, request and handler. Presence checks use `Map.has`; null and other
falsy values remain valid. Raw-key access and direct map writes remain supported
and unchecked at runtime. This implementation does not migrate existing addon
symbols or application factories; they can opt in by wrapping their current keys.

The core README documents the API and interoperability. Runtime and compile-time
regressions cover token isolation, inferred types, invalid writes, diagnostics,
undefined/falsy values and raw-map interoperability through the public entry point.

Verification (2026-09-21): core tests (281 passed), `pnpm test` across all 14
workspaces, `pnpm lint`, `pnpm check`, and `pnpm test:release` passed. Release
verification built and loaded all 12 packed packages in the isolated consumer.

## 3.2 S-09 — Logging defaults and logger binding

1. Set the common `requestResponseLogLevel:'log'` once on the global `LoggingBehavior`.
2. Remove the identical per-handler logging tuples (10 production declarations today).
3. Keep handler-level deltas such as unique-error `mapLogLevel`; rely on the existing shallow global-plus-handler merge.
4. Bind `NativeLogger` with the dedicated `loggerProvider` option rather than `extraProviders` (`observability.module.ts:96`).

Do not remove `extraProviders` merely because the sample no longer needs it; public-surface cleanup belongs to S-14.

## 3.3 S-05 — Default no-op `afterUpdate`

Change `RootEntity.afterUpdate()` from abstract (`root.entity.ts:311`) to an overridable default no-op, then remove the empty overrides from `User`, `Role`, `Auth` and `Capability`. Do not alter version increment, `updatedAt` update, event recording, or the mutation lifecycle timing that F-05 is changing — sequence S-05 after F-05.

## 3.4 S-07 — Safe partition helpers

**Status: CLOSED. Done.** users-api no longer composes tenant-sensitive key strings by hand.

**Rate limiting.** `createUserRateLimitKey` and `createAuthRateLimitKey` are `createPartitionedRateLimitKeyFactory` instances partitioned by the submitted email. For login that address is caller-supplied on purpose: brute force against one account must share a bucket whoever sends it.

**Idempotency.** `createPartitionedIdempotencyKeyFactory({ principal, operation, action?, version?, includeTenant?, requireTenant?, onMissingOperation? })` is the symmetric package helper. It escapes and joins every segment through the core `joinKeySegments`, fails closed with `MissingIdempotencyPartitionError` on a missing tenant or principal, and has no shared fallback. `principal` may return several segments, so users-api passes `[principalType, id]` from the trusted session and a service never shares a user's namespace. `operation` keeps the business identity explicit; an optional client key uses `onMissingOperation: 'skip'`. The behavior's request fingerprint check is unchanged and still composes with it. With the default `'throw'` mode an overload types the factory as `(ctx) => string`.

No "hash the whole command" default was added. The `'anonymous'` fallback is gone.

**Key continuity.** The idempotency layout is the same `v1:<tenant>:<principalType>:<principalId>:<action>:<discriminator>` as F-04, and escaping only alters segments containing `:` or `\` — exactly the ones that could previously collide — so ordinary stored claims keep matching. The rate-limit keys do change layout (the request name is appended); that resets in-memory limiter buckets once, which is accepted given their 60-second window.

## 3.5 S-03 — Composite persistence lifecycle decorator

Introduce `@PersistedWrite`, composing the current low-level lifecycle rather than replacing its implementations. Land it after F-01's residual policy and F-09's transaction contract are settled, so the composite does not encode an unsettled contract.

```ts
@PersistedWrite<User, UserSnapshot>({
  cache: {
    setKey: (user) => filterCacheKey(User, { id: user.id }),
    invalidateKeys: (user) => [filterCacheKey(User, { email: user.email })],
  },
  unique: [
    {
      constraint: 'users_email_unique',
      columns: 'users.email',
      error: (user) => new UniqueEmailException(user),
    },
  ],
})
async save(user: User): Promise<UserSnapshot> {
  // persistence only
}
```

Required semantics:

1. Default entity extraction is the first method argument; allow custom extraction for non-standard signatures.
2. Internally preserve canonical ordering: persistence error translation around the database call; acknowledgment only after successful persistence; cache maintenance after successful acknowledgment.
3. If no unique or residual error mapping is configured, do not install a semantic no-op mapper.
4. Preserve cache barrier, CAS, TTL, serializer and existing best-effort/fail behavior exactly.
5. Preserve the low-level `@Cache`, `@AcknowledgePersisted` and `@MapPersistenceErrors` exports.
6. Adapt the persistence Grit guards to recognize the composite as an equivalent lifecycle declaration.
7. Migrate users-api repositories only after the decorator contract tests pass.

This does not authorize externally managed transaction semantics; the autocommit caveat from F-09 remains.

## 3.6 S-13 → S-17 — Composable metadata, then presets

Implement S-13 only when standalone policy decorators or multiple `UsePipeline` decorators are actually needed. Centralize metadata mutation so decorators deduplicate by `BehaviorId`, preserve deterministic source order, merge behavior options under documented rules, and never overwrite previous pipeline metadata. Do not change the semantics of one existing `@UsePipeline(...)` call.

Then add a small generic preset primitive:

```ts
export const AuditedWrite = createPipelinePreset(
  rateLimit({ keyFactory: perUserWriteKey }),
  audit({ severity: 'medium' }),
);

@CommandHandler(UpdateUserCommand)
@AuditedWrite()
@UsePipeline(idempotent({ keyFactory: updateUserKey }))
export class UpdateUserHandler {}
```

Required properties: preset expansion is ordinary pipeline metadata, not a second runtime; ordering is deterministic and inspectable; typed intent entries work inside presets; handler entries extend or override under the same merge rules; bootstrap diagnostics see the expanded effective chain; application teams own domain-specific presets. Do **not** add a core `@Policies({...})` object that depends on every addon.

## 3.7 S-10 — Core observation bag; remove `TelemetryBridgeBehavior`

Create a small core-owned, telemetry-provider-neutral observation/attribute mechanism, building on S-16's typed tokens.

Required properties: addon behaviors append semantic observations using only their existing core dependency; values are stored per `IPipelineContext`; the OpenTelemetry trace behavior consumes them automatically; `MetricsBehavior` keeps its low-cardinality default and must not copy unbounded request-local identifiers; addon packages gain no OpenTelemetry dependency; failures to add or export observations never change the business outcome.

Migrate the current feature-flag, cache, idempotency, rate-limit and dead-letter observation writes, then delete the users-api `TelemetryBridgeBehavior` once equivalent trace attributes are proven. Do not expose raw cache, idempotency or rate-limit keys as default telemetry attributes.

## 3.8 S-04 — Domain-event publication behavior

Replace the normal users-api dependence on `CommandBaseHandler` (11 production files) with one command pipeline behavior publishing aggregate buffered events after successful handler execution. Recommended name `PublishDomainEventsBehavior`. Land it after F-05, and only once equivalence is proven.

Recognize the same result shapes as `CommandBaseHandler`: an `AggregateRoot`, or an object with `aggregate: AggregateRoot`.

Required equivalence: handler failure publishes nothing; a successful aggregate-bearing result publishes the same buffered events; clear/uncommit follows current successful-publication behavior; publication failure remains a post-persistence application failure exactly as documented; a non-aggregate result is a no-op.

Register it once as the innermost global command behavior so publication happens at the same logical point as the current base-class implementation, before outer behaviors unwind. After equivalence tests pass, migrate handlers to ordinary `ICommandHandler` classes and drop `extends CommandBaseHandler`, the `EventBus` constructor injection used only by the base class, `super(eventBus)`, and the `handle()` indirection where `execute()` suffices.

Keep `CommandBaseHandler` temporarily if compatibility policy requires it; otherwise remove it in the same intentional breaking cleanup. This does **not** change the D-01 in-memory, non-atomic delivery contract.

## 3.9 S-11 — Async static global behaviors

The async module must know provider-graph classes before `useFactory` runs; preserve that invariant. Allow static `globalBehaviors` on `PipelineModuleAsyncOptions` so those classes register before factory execution, letting the factory return only genuinely dynamic values — tenant factory, correlation factory/runner, dynamic runtime defaults. Define deterministic merge rules when both static and factory configurations are supplied, and prefer rejecting ambiguous duplicate placement over silently moving a security behavior.

## 3.10 S-12 — Repository-level cache hydration defaults

Allow `QueryRepository` to own a default snapshot hydration/serialization policy, so a normal aggregate repository specifies the hydrator once and cached methods specify only keys and TTL. Requirements: full `@FromCache({...})` stays supported; method-level options override repository defaults; aggregate-returning repository contracts never leak cached raw snapshots; current mutation-barrier and CAS logic is unchanged.

## 3.11 S-18 — Bootstrap decomposition

Apply after F-08 (done) and S-15 (done), preserving execution order and override semantics throughout.

1. Extract a pure `compilePipelinePlan` accepting discovered handler metadata and global behavior configuration and returning an immutable ordered plan with resolved options. It must not instantiate Nest providers, patch prototypes, open AsyncLocalStorage contexts, or mutate global registries.
2. Extract runner construction and execution into a second module consuming the plan, request context and behavior instances. Keep onion-style `next()` composition, return values, errors, context restoration and nested dispatch semantics identical.
3. Keep a dedicated Nest integration adapter for `ExplorerService`/`InstanceWrapper` access, static versus scoped resolution, dispatch-wrapper installation and cleanup. This is the only layer that knows private framework shapes; do not add private API imports elsewhere.
4. Retain explicit ownership of installed patches: destroying one Nest app must not remove another app's runner, and no first-singleton app may be captured in a process-wide prototype closure. Preserve handler `this`, accessor descriptors and original methods during installation and restoration.
5. Use existing lifecycle and scoped-context tests as characterization tests; add only the gaps extraction reveals — two simultaneous apps, teardown in either order, request-scoped and transient behaviors, concurrent requests, nested command dispatch, a thrown handler and retry wrapping. For each declared supported Nest major, run a real compatibility fixture against that dependency version; a mocked version-shaped object is not a substitute.
6. Keep public decorators and module configuration unchanged. Three cohesive units are the intended decomposition, not a target class count.

Describe the outcome as a maintainability improvement, not a security fix or performance optimization.

## 3.12 S-14 — Narrow only true accidental public surface

**Status: CLOSED. Done.** `PipelineBootstrapService` is unexported from `packages/pipeline/src/index.ts` and from `PipelineModule.forRootAsync` exports, remaining an internal provider of `PipelineModule`. `originalCorrelationId` and `SET_ORIGINAL_CORRELATION_ID` are removed, converging on `correlationId`. `PIPELINE_TENANT_ID` and its duplicate `context.items` mirror are removed, converging on canonical `context.tenantId`. Coherent builders, serializers, record constructors, adapters, and stores (U-05 through U-12) remain intact as public extension points.

Do **not** prune public APIs because `ddd/users-api` does not use them.

Retain unless a **specific API-quality problem** is demonstrated: `cacheKeyTemplate`; `RootEntity.from(...)`; `buildCache`/`buildKeyv`; audit and dead-letter record builders; the resilience policy builder and context; feature evaluation helpers; public Zod raw/validated-data inspection helpers; convenience re-exports such as package-local `stableStringify` and `uuidv7`; addon context observation symbols; provider/store/transport interfaces and bundled adapters.

Classify before acting on `ddd/users-api/src/persistence/memory-store.ts` and `store.interface.ts`: `IStore` is the abstraction both MikroORM stores implement, so a reference count cannot settle it.

If discoverability becomes noisy, an `advanced` subpath may be considered, but moving public imports is still a compatibility change and must not be justified solely by sample usage.

---

# 4. Implementation order and verification discipline

Historical repository-wide order follows. For the current narrowed task, use C2-01 and C2-02 above; do not execute unrelated entries without a separate request.

Implement authorized findings in small commits unless a dependency requires adjustment:

1. F-06;
2. F-07;
3. F-05;
4. N-02, N-04, N-05, N-06, N-07;
5. F-04;
6. F-09 + S-06;
7. F-01 residual adapter policy;
8. ~~F-16~~ — closed; 19/19 classification tests passed;
9. ~~S-16~~ — closed; additive typed context item API;
10. S-09 / A-02 / A-03;
11. S-05 / A-05;
12. S-07 / A-07;
13. S-03;
14. F-11;
15. F-14;
16. S-13, then S-17;
17. S-10 / A-08;
18. S-04;
19. S-11, S-12;
20. F-15 / S-18;
21. S-14 / U-01…U-03;
22. A-09 and the remaining F-17 documentation work, alongside their related fixes.

For every step:

- write the regression first and confirm it fails on the pre-fix tree;
- preserve current behavior with focused before/after tests;
- update users-api to demonstrate the simpler normal path, but never treat lack of sample usage as evidence that an externally useful public API is dead;
- keep one advanced escape-hatch test;
- run package and unit checks for the touched packages;
- run the relevant users-api E2E suites;
- run `pnpm check` and `pnpm lint:persistence`, plus `pnpm test:release` for published-surface changes;
- run `pnpm verify:all` before claiming a track is complete.

Tests must assert observable consequences — how many times a side effect ran, who can see a response, which version was published, when durable acknowledgment happened — not that new configuration matches the new code. Do not interpret fewer lines as success if safety decisions become implicit. The acceptance test is that a users-api developer needs less framework implementation knowledge while all current capabilities remain available.

---

# 5. D-01 — Durable domain-event delivery / transactional outbox

**Status: DECISION REQUIRED. DO NOT IMPLEMENT WITHOUT OWNER APPROVAL.**

## 5.1 Existing contract to preserve until the decision

`CommandBaseHandler` (`ddd/core/application/command-base.handler.ts:105-130`) executes the command, receives an aggregate-bearing result, publishes buffered events through the Nest EventBus, clears the aggregate's uncommitted events, and documents explicitly that database persistence and in-memory publication are not atomic. `AGENTS.md` rule 10 says not to assume the EventBus is an outbox. This is a known limitation, not an accidentally missing retry.

## 5.2 Owner decision questions

Obtain explicit answers before any code:

1. Is durable event delivery actually required?
2. Which event classes or workflows require it — all domain events, or only selected integration events?
3. Is at-least-once delivery acceptable?
4. Must the aggregate write and the outbox insertion be atomic in the same database transaction?
5. Which database owns the outbox in multi-tenant operation?
6. What is the target relay/transport: BullMQ, RabbitMQ, Kafka, database polling, another broker?
7. Is per-aggregate ordering required?
8. Is global ordering required? Normally avoid promising it unless explicitly required.
9. What stable event identifier is used for deduplication?
10. Are consumers required to be idempotent?
11. What are the retry, backoff and dead-letter semantics?
12. What is the retention and cleanup policy?
13. What operational visibility is required?
14. Is the sample application expected to demonstrate the infrastructure or only the library contract?

Do not infer answers.

## 5.3 If the owner chooses NO

No production change is required. Close D-01 by recording the decision in `Final.Review.md`, preserving in-memory EventBus semantics, the explicit crash window, and the absence of any durability claim. Do not add an outbox port "for future use".

## 5.4 If the owner chooses YES

Do not start with `CommandBaseHandler`. Design transaction ownership first.

> The durable aggregate write and the durable outbox record must commit atomically, or the design does not close the original failure window.

A compliant implementation will likely require persistence-layer transaction orchestration rather than a post-save application call. Because `AggregateRoot` is now owned in `ddd-core/domain` (D-02), the uncommitted events are already reachable at the persistence boundary during `save()`, so the outbox needs no coupling to the Nest `EventPublisher`.

Required design artifacts before implementation: durable `OutboxRecord` shape; event id and aggregate identity/version fields; tenant partition/routing fields; serialized payload contract; created/available/attempted timestamps; delivery state and attempt count; relay ownership/lease mechanism for multiple workers; deduplication contract; transaction boundary; mapper from in-memory domain event to durable record; relay port and infrastructure adapter; failure/retry/dead-letter behavior.

Architecture boundaries: domain events stay framework-neutral data; CQRS handlers do not inject a concrete broker; application code does not import BullMQ or RabbitMQ clients; persistence code may own database-specific transaction mechanics; the broker relay lives in infrastructure; the Nest EventBus must not pretend to be durable; do not publish through both EventBus and outbox unless the owner defines the two-channel semantics.

Tests required if YES: aggregate write and outbox row commit together; a failure before commit persists neither; a process-level relay can retry a durable pending record; duplicate relay attempts are safe; tenant routing is preserved; the ordering guarantee matches the approved contract; cleanup does not delete pending records; application handlers contain no concrete broker dependency. Docker-backed database tests are required for the atomicity claim.

This decision interacts with S-03 and S-04: neither may imply durability it does not provide.
