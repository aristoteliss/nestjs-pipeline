# LLM Agent Implementation Brief

**Review source of truth:** `docs/reviews/Final.Review.md`

This file is the executable implementation companion to the Final Review. It translates approved findings into implementation steps; it does not redefine review conclusions or authorize decision-gated work. The current code, `AGENTS.md`, and `.agents/skills/nestjs-pipeline-architecture/SKILL.md` remain authoritative for runtime and architecture contracts.

Read `AGENTS.md` and the architecture skill before editing. Implement one finding per reviewable change, with its focused regression tests. Do not merge several findings into a framework rewrite. Preserve public behavior unless a migration is explicitly required below.

**Scope and compatibility.** Both cache layers and the persistence lifecycle decorators stay. The example application does not define the public product surface. Before deleting an export, supported type, adapter or overload, identify its documented contract, external-consumer impact and an actual maintenance or correctness cost. A local reference search cannot prove a published API has no consumers. Never fix a failing regression by weakening tenant isolation, entity authorization, optimistic concurrency, ownership-aware idempotency completion or mutation detachment.

**Verification per change.** Use package-scoped checks while iterating (`pnpm --filter <pkg> test`, `pnpm --filter <pkg> lint`). At completion run `pnpm check`, `pnpm lint:persistence`, the affected workspace suites, and the relevant users-api E2E. Run `pnpm test:release` for any published-surface change. If E2E infrastructure is unavailable, state that limitation instead of claiming coverage.

---

# 1. Closed items — do not reopen

| ID | What closed it |
|---|---|
| ~~E-01~~ | `integration/packages/release.mjs` discovers non-private packages, packs them, checks archive identity and contents, installs into an isolated consumer, and runs generated TypeScript/runtime imports plus the core lifecycle and CASL 7 fixtures. Coverage limits are documented in `integration/packages/README.md`. CASL advertises `@casl/ability ^7.0.0`; CASL 6 is out of the advertised peer contract by owner decision. |
| ~~E-02~~ | `AGENTS.md` rule 13 and the architecture skill both describe the framework-neutral contract: persistence adapters surface version conflicts as `ConcurrencyConflictError`, application and domain code stay independent of MikroORM error classes, presentation maps 409, missing rows stay `EntityNotFoundException`, unique-constraint errors keep their own mapping. No production error behavior changed. |
| ~~F-02~~ | The correlation-scoped `defaultCacheKey` was removed. `CacheBehavior` declares a bootstrap contract that rejects an active cache declaration without a key, and `createPartitionedCacheKeyFactory` fails closed on missing tenant or principal. Residual documentation drift is tracked as N-02. |
| ~~F-03~~ | `IdempotencyBehavior` releases the claim only when `next()` throws. Snapshot and completion-store failures retain the claim and raise `IdempotencyCompletionError` carrying a `snapshot` or `store` phase. |
| ~~F-08~~ | `getBehaviorId()` returns the constructor reference; `PIPELINE_BEHAVIOR_ID` remains an opt-in stable string for duplicated package copies. |
| ~~F-10~~ | The actor-first authorization overload was removed and replaced by an explicit error naming the supported form. |
| ~~S-01~~ | `@SkipPipeline(...behaviors)` with `PIPELINE_SKIPPED_BEHAVIORS_METADATA`, `BehaviorId` filtering before DI resolution, preserved chain order, command/query/event and singleton/scoped support, and bootstrap failure on a contradictory skip plus local re-add. |
| ~~S-02~~ | Typed intent builders in seven packages: `authorize`, `rateLimit`, `idempotent`, `cache`, `featureFlag`, `audit`, `resilience`. They return the existing `PipelineBehaviorEntry` tuple and require activation fields; raw tuples remain valid. |
| ~~S-15~~ | `PIPELINE_BEHAVIOR_CONTRACT` with per-behavior `validate`/`order` hooks, implemented by the cache, rate-limit, idempotency, feature-flag and resilience behaviors, with strict/warn/off diagnostics and a users-api integration spec. |
| ~~S-08 / A-01 / U-10~~ | Superseded, not implemented. `ddd/users-api/src/users/cqrs/queries/get-user-overview.handler.ts` is a real production `CacheBehavior` consumer, so the users-api `CacheModule` registration is live wiring. Do not remove it. Its missing entity authorization is N-01. |
| ~~A-04 / U-09~~ | No semantic no-op `@MapPersistenceErrors({ unique: [] })` invocation remains in users-api. |
| ~~D-02~~ | Resolved: `AggregateRoot` with NestJS 12 semantics is owned in `ddd/core/domain`; the domain entry point loads no `@nestjs/*` and no `@mikro-orm/*`, enforced by `domain-entry-point.spec.ts`. **Do not treat D-02 as an open decision.** |
| ~~D-03~~ | Resolved: direct `accessor: true` mapping retained, hydration setters annotated `@internal`/`@deprecated`, `biome/plugins/aggregate-identity.grit` rejecting dot and literal-bracket writes, compound assignments and updates on receivers named `user`, `role`, `aggregate`, `entity` in application layers. The guard is syntax- and naming-based only; domain-method mutation stays mandatory outside its coverage. |

---

# 2. Correctness and security track

Implement in this order. Each item must ship with a regression that fails before the fix and passes after it.

## 2.1 F-06 — Audit options that are silently ignored

**Status: OPEN. Reproduced.** With `metadataFactory`, `buildAuditRecord` emits `metadata: {"tenantId":"t"}` and `actor: undefined`.

`AuditBehaviorOptions` declares `metadata?: AuditMetadataFactory` (`packages/pipeline-audit/src/interfaces/audit-options.interface.ts:92`). `ddd/users-api/src/users/cqrs/commands/delete-user.handler.ts:38` and `ddd/users-api/src/roles/cqrs/commands/delete-role.handler.ts:38` pass `metadataFactory`, so the target id, acting user id and acting email never reach the HIGH-severity audit record.

1. Rename the option to `metadata` in both handlers, using the declared callback signature and record field types. Include the target identifier and intended action metadata; do not serialize full entities or secrets.
2. Configure a trusted actor factory, preferably once in the application `AuditModule` defaults if all audited requests share the same principal context. Define anonymous/system behavior explicitly rather than inventing an authenticated actor.
3. Extract the option literals into constants with `satisfies AuditBehaviorOptions` so an unknown property becomes a compile error. Apply the same local pattern to the other built-in behavior options touched by this track. Do not redesign the decorator generic system to catch one typo.
4. Add compile-time coverage proving an unknown property such as `metadataFactory` is rejected in a typed option literal.
5. Add a focused runtime test using the real decorated handler metadata and the actual `AuditBehavior` with a fake sink, asserting action, actor, tenant and target metadata in the emitted record. Test both success and the configured failure-record policy, and verify the actor factory does not trust a caller-supplied body field.

**Acceptance:** no `metadataFactory` usage for `AuditBehavior`; both deletion handlers produce the intended record with actor and target; tests assert the emitted record, not the presence of a decorator entry.

## 2.2 F-07 — Deep equality returns the wrong answer for Sets

**Status: OPEN. Reproduced.** `deepEqual(Set([{n:1},{n:1}]), Set([{n:1},{n:2}]))` is `true`; the reverse is `false`.

`packages/pipeline-zod/src/helpers/zod-data.helpers.ts:133-146` iterates the right-hand Set without consuming the matched element, so two left entries can both match one right entry. Equality decides whether a mutated command is revalidated.

1. Apply the one-to-one consumption principle already used by the Map branch immediately above: copy right-side values into an unmatched list, find one deeply equal unmatched value per left value, remove only that match, return `false` when none exists. Do not use `every(...some(...))`.
2. Preserve the helper's existing supported-value semantics. Do not substitute JSON stringification, which loses Sets/Maps/types, and do not re-run schema transforms on every invocation; the existing optimization prevents transforms running twice on an unchanged constructed command.
3. Test distinct object entries with equal shapes, unequal multiplicities, insertion-order independence, nested Sets and Maps, equal primitives, and symmetry (`equal(a,b) === equal(b,a)`) across the supported acyclic domain.
4. Add a behavior-level regression: a validated command carrying a Set of `{n:1}` and `{n:2}` with a refinement requiring an entry whose `n` is 2; mutate the second object to `{n:1}` without changing the Set size; the pipeline must detect the changed snapshot, revalidate, reject, and never invoke the handler. Assert an unchanged transformed command does not run its transform twice.
5. Document the clone/equality supported domain. If cyclic values are outside it, reject them with a clear error before recursive overflow rather than claiming arbitrary-object support.

**Acceptance:** the reproduced Sets compare unequal in both directions; the mutated request is rejected at the behavior level; normal object commands, async refinements, defaults and once-only transforms are unchanged.

## 2.3 F-05 — Mutation events carry the previous version and timestamp

**Status: OPEN. Reproduced.** After `user.update(...)` the aggregate is version 2 while the event reports `aggregateVersion: 1`, `payload.version: 1` and the earlier `updatedAt`.

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

**Status: OPEN. New.**

`ddd/users-api/src/users/cqrs/queries/get-user.handler.ts:32-35` loads the aggregate and returns `this.authorizer.authorize('read', user)`, applying entity and field-level rules. `get-user-overview.handler.ts:83-105` is reachable under the same type-level rule `read User`, loads the same aggregate through the same repository port, and returns `username`, `email` and `department` with no `CaslAuthorizer` call. The result is then cached for 60 seconds, so a hit also skips any future check. This contradicts `AGENTS.md` rule 4 and architecture-skill rule 7 in the handler whose own JSDoc presents it as the exemplary cache consumer.

1. Authorize the loaded aggregate before composing the DTO, exactly as `GetUserHandler` does, and build the returned fields from the authorized projection rather than from the raw aggregate.
2. Keep the partitioned cache key. Extend its `scope` so it also reflects the viewer's `additionalCapabilities`, not only the sorted role list: a capability change that leaves the role set intact currently keeps serving the previously authorized response until the TTL expires.
3. Replace the `ctx.items.get('user') as SessionUser | undefined` casts in the key factory with typed accessors once S-16 lands. Until then, make the principal resolution fail closed rather than producing a key with an absent principal.
4. Add a regression asserting that two principals with different field permissions receive different overview payloads, and that a cache hit never crosses that boundary. Add a second asserting that a capability change invalidates or re-partitions the cached response.
5. Correct the handler's JSDoc so it stops describing the current shape as optimal usage.

**Acceptance:** every field returned by the overview handler has passed the same entity and field authorization as the equivalent single-aggregate query, and no cached entry can be replayed across a security boundary.

## 2.5 F-04 — Idempotency replay is not bound to the authorization scope

**Status: OPEN.** No `replayScope` exists in the package or the sample. Keys are `tenant:actor:action:business-id` with an `'anonymous'` fallback (`create-user.handler.ts:26-32`, `create-role.handler.ts:23-31`).

Adding a permission hash to the operation key is **not** an acceptable fix: new permissions would produce a new key and allow the same side effect to run again. Keep the operation identity stable and bind replay separately.

1. Add one application helper resolving a trusted authenticated principal from the established request/session context, requiring tenant id, principal type and principal id. Reject absent context for these protected create commands. Do not use request-body identity fields and do not use the string `'anonymous'`.
2. Encode the stable operation key as a versioned canonical tuple of tenant, principal type and id, action, and the existing operation discriminator. Do not silently redefine the current email/name deduplication lifetime; document that email/name identify a business object rather than a unique client operation. A future client `Idempotency-Key` contract is a separate API decision.
3. Add an optional `replayScopeFactory` to the generic idempotency behavior and an optional `replayScope` string on stored records. Configure it as mandatory in the protected users-api handlers. Compute a deterministic digest of the effective ability rules and trusted condition context, preserving rule order, field restrictions, inversion and condition value types. Fail before claim acquisition when the required ability or context is missing.
4. Capture the digest in the owned record and preserve it on completion in the Memory, Redis and PostgreSQL stores. On any path that could return a completed response, compare the stored digest with the current one first. On mismatch, or on a legacy record missing a required digest, throw a framework-neutral replay-scope conflict error. Do not delete the record, return its response, or execute the command again. Keep the existing fingerprint conflict check as an independent check.
5. Keep current-request CASL before idempotency and entity authorization on first execution. Scope equality is valid only for decisions represented by the captured context; operations whose authorization depends on later-changing resource state need an explicit application replay-authorization hook or must disable result replay.
6. Update `AGENTS.md` rule 5 to state that an idempotent operation may keep a stable identity only when replay has an equivalent fail-closed scope check, and why changing the operation key on permission change can duplicate side effects.
7. Test same-principal same-scope replay, changed permissions with an unchanged command, user and service principals with equal ids, missing actor/tenant/ability, legacy scope-less records, and changed payload fingerprints. Assert no side effect on replay-scope mismatch. Round-trip every store so the added field is not dropped by an adapter.

**Migration:** version the new key namespace deliberately. Changing namespaces invalidates existing deduplication claims and may permit re-execution; plan the rollout around the configured TTL or translate existing records where safe.

## 2.6 F-09 + S-06 — Shared optimistic delete and one autocommit contract

**Status: OPEN.** Neither `optimisticDelete` nor `assertAutocommit` exists. `delete-user.command-repository.ts` and `delete-role.command-repository.ts` are identical apart from one secondary cache key line. `optimisticUpdate` rejects an outer transaction (`optimistic-update.ts:80-83`); the delete and create paths do not.

1. Add `assertAutocommit(em, operation)` beside the existing optimistic update implementation, using `em.isInTransaction()`. It must fail before executing a database write. Reuse it in update, the new optimistic delete, and create/save methods whose decorators or callers treat a successful return as durable completion.
2. Add `optimisticDelete` with explicit inputs — EntityManager, entity class, aggregate, expected persisted version, entity label/id accessor. Execute exactly one conditional delete on `{ id, version: aggregate.getExpectedVersion() }`. One affected row is success. Zero triggers a refreshed lookup: absent raises `EntityNotFoundException`, present raises `ConcurrencyConflictError`. An unexpected affected-row count is an invariant error.
3. Capture the EntityManager once per operation. Do not re-resolve `store.em` midway through delete and existence checking, and do not create an independent fork that escapes the caller's transaction merely to avoid rejecting it.
4. Keep infrastructure exceptions mapped at the established repository boundary. Avoid double-wrapping. Reuse the existing error mapper; do not introduce a generic CRUD base class or a repository DSL for two methods.
5. Migrate the User and Role delete repositories. Do not apply a version predicate to unversioned Auth/session rows by inventing fields; document those lifecycle differences. A delete returning null does not require acknowledging a nonexistent new persisted snapshot.
6. For create paths, reject externally active transactions before flush/upsert when a successful return triggers acknowledgment or publication. Preserve the canonical decorator order. If transaction participation becomes a requirement it needs commit callbacks or unit-of-work semantics; it must not be emulated by early acknowledgment.
7. Add adapter-backed tests: matching-version deletes; stale-version conflicts; missing row produces not-found; an outer transaction is rejected before mutation; a failed create/update leaves the expected version unchanged; no event publication or invalidation occurs on rejection. Exercise both database engines where available.

**Acceptance:** one implementation of versioned delete; every path claiming durable success enforces the same transaction boundary; a caller cannot cause acknowledgment or publication merely by flushing uncommitted work.

## 2.7 F-01 residual — policy for adapters without revisions

**Status: MOSTLY DONE.** `ddd/core/persistence/cache.interface.ts:98-134` defines `IVersionedCache` with `readState`, `tryFill` and an opaque revision; `MemoryCache` and `MikroOrmCache` implement it; `FromCache.ts:144-198` uses revision-fenced fills; filter keys are a SHA-256 canonical `[tenant, resource, normalizedFilter]` tuple preserving value types and failing closed without tenant.

What remains is the compatibility clause. `FromCache.ts:200-283` silently falls back to the legacy `get`/`set` path for any adapter lacking the versioned methods, and that path still lets a stale snapshot overwrite a deletion barrier installed between its post-database `get()` (`:215`) and its `set()` (`:236`/`:278`).

1. Decide the policy explicitly: reject an unversioned adapter at configuration time, or bypass both cache reads and fills for the affected repository path. Bypassing fills alone can still serve stale legacy entries.
2. Implement the chosen policy with a capability check rather than a silent degrade, and document it in `ddd/core/README.md`.
3. Add an adapter-contract test for "adapter exposes only `get`/`set`" asserting the chosen behavior.
4. Preserve the existing best-effort semantics documentation: a database commit followed by an unavailable invalidation can leave stale entries until expiry, and per-key CAS cannot remove that dual-write window. Do not add an outbox as part of this fix.

## 2.8 F-16 — Dead-letter classification for expected rejections

**Status: PARTIALLY DONE.** `ddd/users-api/src/infrastructure/reliability.module.ts:64-82` excludes `ZodValidationError`, `UnauthorizedException` and `UnauthorizedActionException`. The framework-neutral business rejections the application actually raises are not excluded, so an ordinary duplicate-email signup still produces a dead letter with a retained payload.

1. Define an application-owned error classification policy close to the composition root, keyed on explicit error types or stable typed codes — never message substrings or blanket `instanceof Error` rules.
2. Exclude expected rejections: `EntityNotFoundException`, unique-constraint exceptions, `EmptyUserUpdateException`, `InvalidLoginCredentialsException`, `ConcurrencyConflictError`, feature-disabled, rate-limit and idempotency conflicts. Inventory the concrete classes first; do not exclude every `DomainException` subclass, since some represent unexpected invariant failures.
3. Use the package's existing ignore/filter hook if sufficient. If it cannot express the classification, add one optional typed predicate such as `shouldCapture(error, context)` while preserving the existing generic defaults. Keep application-specific imports out of the reusable package.
4. Treat `IdempotencyCompletionError` with `executionSucceeded` as operational failure after business success: route it to ordinary error/metrics reporting or a non-replayable diagnostic path, never to a queue whose normal recovery re-executes the command. Do not retry it through resilience configuration.
5. Preserve DLQ capture for unexpected failures in real background and event work, with tenant/correlation metadata, redaction, payload limits and sink error semantics intact. Do not claim the in-memory EventBus plus DLQ together provide a transactional outbox.
6. Test classification with the actual application error classes and the real composed options: expected rejections create zero records, an unexpected processor failure creates exactly one, and a post-success completion error cannot schedule a command replay. Verify observability overrides merge the policy rather than replacing it.

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

## 2.11 N-02 … N-06 — Documentation accuracy and hygiene

Cheap and independent; land each with its related fix rather than batching them at the end.

- **N-02** — `packages/pipeline-cache/src/helpers/README.md:3` still documents `defaultCacheKey()` as a correlation-scoped safe default. That function no longer exists, and the correlation-based default was removed precisely because it is not an authorization boundary. Rewrite the file around the real contract: there is no default key, an active `CacheBehavior` must declare one, `createPartitionedCacheKeyFactory` fails closed. Then extend `ddd/users-api/test/docs-cache-security.spec.ts` — which currently reads only `ddd/users-api/README.md` — to cover every file documenting cache key security, including package READMEs.
- **N-03** — `create-auth.handler.ts:45-49` derives the audit actor from `req?.email ?? 'anonymous'`, a caller-supplied body field, so a login attempt is attributed to an unverified identity. For a pre-authentication command the claimed identity is the only one available: record it as a claimed subject rather than as `actor.id`, or emit the actor only after authentication succeeds. Pair this with F-06's trusted actor factory.
- **N-04** — Remove the review identifiers from test titles: `behavior-composition-contracts.spec.ts:4,73` (`R-07`) and `docs-cache-security.spec.ts:8,14` (`Finding #20`). Rename both suites after the behavior they assert. Then either extend `biome/plugins/test-suite.grit` — which today only rejects `.only`/`fit`/`fdescribe` — to reject identifier patterns in `describe`/`it` strings, or record in `AGENTS.md` that the rule is review-enforced. Do not leave a documented invariant with no owner.
- **N-05** — Delete the 36 decorative divider comments in `packages/pipeline/src/services/pipeline.bootstrap.service.spec.ts` (20) and the five `packages/pipeline-zod` spec files (16). Use `describe` nesting for structure. If dividers are acceptable in tests, amend `AGENTS.md` instead of leaving the rule contradicted by the tree.
- **N-06** — `ddd/users-api/src/persistence/cache/mikro-orm.cache.ts:253-257` swallows a `JSON.parse` failure with a bare `catch {}`, which skips the `isNewer` CAS guard and overwrites the entry. Keep the behavior; make it explicit with a named error, one short factual comment stating that an unparsable entry is treated as absent, and a diagnostic so persistent corruption is observable.

## 2.12 A-09 / F-17 — Example honesty and documentation authority

- **A-09** — `send-welcome-email.processor.ts:49-57` and `batch-update-users.processor.ts:95-107` still log and `setTimeout` without sending an email or updating a row. Keep them as labelled demonstrations of queue integration, chunking and port boundaries; rename them so the class and job names say they simulate, make the returned result and logs state that no email was sent and no row was updated, and remove the artificial sleeps. Do not introduce SMTP credentials or a real provider to justify the class. Wire producer and consumer consistently if a demonstration is disabled. Replace tests asserting artificial delays or log text with tests of the remaining contract.
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
| S-07 | **Operational/data-key breaking risk.** | A new canonical key format creates fresh limiter and idempotency namespaces. Preserve or version the existing format, or explicitly accept the reset. |
| ~~S-08~~ | ~~Users-api module composition break only.~~ | Superseded: a real `CacheBehavior` consumer exists. Do not remove the wiring. |
| S-09 | **Potential behavior/config break.** | Compare effective `LoggingBehavior` options per handler before and after; do not change log level or volume accidentally. |
| S-10 | **Non-breaking only if the observability contract is preserved.** | Keep current attribute names/values and compatibility item symbols during migration. Removing symbols or renaming attributes is a separate breaking change. |
| S-11 | **Non-breaking / additive.** | Existing async configuration forms must remain valid; the static-global form is optional. |
| S-12 | **Non-breaking if defaults are optional.** | Keep current constructors and full `@FromCache` configuration valid. |
| S-13 | **Behavioral break for stacked decorators.** | One existing `@UsePipeline` call is unchanged. Explicitly test and document the new compose-versus-overwrite behavior. |
| S-14 | **Public API/source breaking only for the narrow symbols actually removed or moved.** | Do not use users-api usage as deletion evidence. Retain coherent helpers, builders and adapters; perform true compatibility cleanup in one intentional breaking release or keep deprecation aliases. |
| ~~S-15~~ | ~~Additive first; later strictness can be behavior-breaking.~~ | Shipped. If a formerly accepted deterministic misconfiguration later becomes a bootstrap error, document that policy change. |
| S-16 | **Non-breaking / additive.** | Keep raw `context.items`; typed tokens layer on top. |
| S-17 | **Non-breaking / additive.** | Presets expand to existing pipeline entries; `@UsePipeline` remains available. |
| S-18 | **Non-breaking.** | Internal decomposition only. Public decorators and module configuration stay identical; existing lifecycle tests become characterization tests. |

The implementation agent optimizes for one obvious normal path, typed declarative intent, safe defaults, first-class per-handler exceptions, no duplicated security-sensitive key mechanics, no behavior or persistence ordering knowledge in ordinary application code, and unchanged advanced capability.

## 3.1 S-16 — Typed pipeline context items

Keep `IPipelineContext.items` as the low-level interoperability bag and add a typed layer so application and package code stop using magic strings and casts. Production code currently writes `ctx.items.get('user') as SessionUser | undefined` inside a security key factory (`get-user-overview.handler.ts:30-35`), where a misspelled key silently yields a key with an absent principal.

```ts
const CURRENT_USER_ID = createPipelineItem<string>('currentUserId');

setPipelineItem(ctx, CURRENT_USER_ID, user.id);
const userId = getPipelineItem(ctx, CURRENT_USER_ID);      // string | undefined
const required = requirePipelineItem(ctx, CURRENT_USER_ID); // string or actionable error
```

Requirements: token identity is collision-safe; the value type travels with the token at compile time; `requirePipelineItem` fails with a message identifying the missing item; built-in exported item constants adopt the typed shape without changing identity semantics; raw `context.items.get/set` remains supported; no central registry and no second DI system.

Use typed accessors in new package examples and in the key, actor and targeting factories.

## 3.2 S-09 — Logging defaults and logger binding

1. Set the common `requestResponseLogLevel:'log'` once on the global `LoggingBehavior`.
2. Remove the identical per-handler logging tuples (10 production declarations today).
3. Keep handler-level deltas such as unique-error `mapLogLevel`; rely on the existing shallow global-plus-handler merge.
4. Bind `NativeLogger` with the dedicated `loggerProvider` option rather than `extraProviders` (`observability.module.ts:96`).

Do not remove `extraProviders` merely because the sample no longer needs it; public-surface cleanup belongs to S-14.

## 3.3 S-05 — Default no-op `afterUpdate`

Change `RootEntity.afterUpdate()` from abstract (`root.entity.ts:311`) to an overridable default no-op, then remove the empty overrides from `User`, `Role`, `Auth` and `Capability`. Do not alter version increment, `updatedAt` update, event recording, or the mutation lifecycle timing that F-05 is changing — sequence S-05 after F-05.

## 3.4 S-07 — Safe partition helpers

Do not let users-api compose tenant-sensitive key strings by hand when a package helper owns the mechanics.

**Rate limiting.** Migrate the current manual factories (`create-user.handler.ts:34-37`, `create-auth.handler.ts:29-32`) to `createPartitionedRateLimitKeyFactory` where semantics match.

**Idempotency.** Add a symmetric helper:

```ts
createPartitionedIdempotencyKeyFactory({
  principal: (ctx) => ...,
  key: (ctx) => ...,
  // tenant required by default
})
```

The exact shape may differ but must fail closed on missing tenant or principal, escape and join segments through core canonical helpers, keep business-operation identity explicit, and compose with the existing request fingerprint validation rather than replacing it. Remove the `'anonymous'` fallback as part of this work.

Do not invent an automatic "hash the whole command" idempotency default; identical request bodies can represent intentionally distinct business operations.

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

Do **not** prune public APIs because `ddd/users-api` does not use them.

High-confidence cleanup:

- stop exporting `PipelineBootstrapService` from `packages/pipeline/src/index.ts:33`; keep it an internal provider of `PipelineModule`;
- converge tenant access on `context.tenantId`, with an explicit migration for the `PIPELINE_TENANT_ID` item mirror (5 production files);
- deprecate then remove `originalCorrelationId` / `SET_ORIGINAL_CORRELATION_ID` (3 production files) when compatibility policy allows;
- use the public `CaslAuthorizerOptions` type consistently instead of maintaining a duplicate inline `{ bypass?: boolean }` shape.

Already closed: `PIPELINE_OPTIONS_REGISTRY` no longer exists; the semantic no-op decorator usage is gone.

Retain unless a **specific API-quality problem** is demonstrated: `cacheKeyTemplate`; `RootEntity.from(...)`; `buildCache`/`buildKeyv`; audit and dead-letter record builders; the resilience policy builder and context; feature evaluation helpers; public Zod raw/validated-data inspection helpers; convenience re-exports such as package-local `stableStringify` and `uuidv7`; addon context observation symbols; provider/store/transport interfaces and bundled adapters.

Classify before acting on `ddd/users-api/src/persistence/memory-store.ts` and `store.interface.ts`: `IStore` is the abstraction both MikroORM stores implement, so a reference count cannot settle it.

If discoverability becomes noisy, an `advanced` subpath may be considered, but moving public imports is still a compatibility change and must not be justified solely by sample usage.

---

# 4. Implementation order and verification discipline

Implement in small commits in this order unless a dependency requires adjustment:

1. F-06;
2. F-07;
3. F-05;
4. N-01;
5. N-02, N-04, N-05, N-06;
6. F-04;
7. F-09 + S-06;
8. F-01 residual adapter policy;
9. F-16;
10. S-16;
11. S-09 / A-02 / A-03;
12. S-05 / A-05;
13. S-07 / A-07;
14. S-03;
15. F-11;
16. F-14;
17. S-13, then S-17;
18. S-10 / A-08;
19. S-04;
20. S-11, S-12;
21. F-15 / S-18;
22. S-14 / U-01…U-03;
23. A-09 and the remaining F-17 documentation work, alongside their related fixes.

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
