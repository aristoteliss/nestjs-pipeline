# LLM Agent Implementation Brief

**Review source of truth:** `docs/reviews/Final.Review.md`

This file is the executable implementation companion to the Final Review. It translates approved findings into implementation steps; it does not redefine review conclusions or authorize decision-gated work. The current code, AGENTS.md, and `.agents/skills/nestjs-pipeline-architecture/SKILL.md` remain authoritative for runtime and architecture contracts.

## E-01 — Automatic packed-consumer verification

The owner-approved scope is one release script plus the existing small core/CASL fixtures, with support for CASL 7 only. Do not introduce manually maintained package/import lists or a CASL 6 compatibility matrix.

`pnpm test:release` rebuilds, copies licenses, and runs `integration/packages/release.mjs`. The script discovers non-private packages from manifests, packs and inspects their exact name/version set, installs tarballs into an isolated temporary consumer, and generates static imports for TypeScript compilation and Node runtime loading.

Required external peers are derived from manifests at the versions installed in the workspace lockfile graph. Optional backends remain optional. Core request-scope and two-application lifecycle checks and the CASL authorization fixture must pass. Keep all verification code private; do not add production test seams.

See `integration/packages/README.md` for setup, behavior, and coverage limits. CASL advertises `@casl/ability ^7.0.0`; this excludes consumers requiring CASL 6 and is an owner-approved compatibility change.

## E-02 — Authoritative concurrency-error guidance

AGENTS.md and the architecture skill must describe the current contract:

- Persistence adapters may observe ORM/driver-specific conflict signals; repository helpers surface version conflicts as framework-neutral `ConcurrencyConflictError`.
- Domain/application code stays independent of MikroORM error classes.
- Presentation maps `ConcurrencyConflictError` to HTTP 409.
- Missing rows remain `EntityNotFoundException`.
- Unique-constraint and other database errors retain their separate mappings.

No production error behavior changes are required.

## Verification

Run `pnpm check`, `pnpm lint:persistence`, and `pnpm test:release` for the implementation. Verify failure detection with temporary mutations, removing them afterward. Run `pnpm verify:all` for full verification, including non-skipped Docker/Testcontainers E2E. Do not close V-01 based only on source inspection or the owner's report of a green baseline.

D-01 through D-03 remain decision-gated. The CASL compatibility decision does not authorize changes to them.


# 3. Simplification implementation track — S-01 through S-17

**Status: IMPLEMENTABLE, SUBJECT TO THE ORDER AND SAFETY CONSTRAINTS BELOW.**

**Detailed evidence and rationale:** `docs/reviews/Final.Review.md`, section **Detailed simplification review — S-01 through S-17**.

This track is not permission to reduce features. Its objective is to make the normal users-api-style application surface smaller and safer while preserving the existing low-level APIs as explicit escape hatches.


## 3.0 Breaking-change classification

| ID | Breaking classification | Migration rule |
|---|---|---|
| S-01 | **Non-breaking / additive.** | Existing handlers are unchanged; only handlers using `@SkipPipeline` get new behavior. |
| S-02 | **Non-breaking / additive.** | Keep raw `[Behavior, options]` tuples working indefinitely unless a separate breaking decision is made. |
| S-03 | **Non-breaking / additive.** | Add `@PersistedWrite` first and migrate users-api. Do not remove low-level persistence decorators as part of this item. |
| S-04 | **Potential public source break.** | Add behavior and migrate handlers first. Removing `CommandBaseHandler` requires an intentional breaking cleanup/deprecation step. |
| S-05 | **Non-breaking.** | Abstract hook becoming a default no-op remains override-compatible. |
| S-06 | **Non-breaking / additive.** | Helper must preserve exact current optimistic-delete outcomes. |
| S-07 | **Operational/data-key breaking risk.** | A new canonical key format may create fresh limiter/idempotency namespaces. Preserve/version existing key format or explicitly accept the reset. |
| S-08 | **Users-api module composition break only.** | If any consumer imports `ReliabilityModule` for its cache re-export, it must import/configure cache directly. Standalone cache package is unchanged. |
| S-09 | **Potential behavior/config break.** | Compare effective LoggingBehavior options per handler before/after; do not accidentally change log level/volume. |
| S-10 | **Non-breaking only if observability contract is preserved.** | Keep current attribute names/values and compatibility item symbols during migration. Removing symbols or renaming attributes is a separate breaking change. |
| S-11 | **Non-breaking / additive.** | Existing async configuration forms must remain valid; new static-global form is optional. |
| S-12 | **Non-breaking if defaults are optional.** | Keep current constructors and full `@FromCache` configuration valid. |
| S-13 | **Behavioral break for stacked decorators.** | One existing `@UsePipeline` call is unchanged. Explicitly test/document the new compose-vs-overwrite behavior for multiple decorators. |
| S-14 | **Public API/source breaking only for the narrow symbols actually removed/moved.** | Do not use users-api usage as deletion evidence. Retain coherent helpers/builders/adapters; perform true compatibility/implementation cleanup in one intentional breaking release or keep deprecation aliases. |
| S-15 | **Additive first; later strictness can be behavior-breaking.** | Introduce diagnostics/contracts compatibly. If a formerly accepted deterministic misconfiguration becomes a bootstrap error, document that policy change and provide a warning/compatibility phase if required. |
| S-16 | **Non-breaking / additive.** | Keep raw `context.items`; typed tokens/accessors layer on top. |
| S-17 | **Non-breaking / additive.** | Presets expand to existing pipeline entries; keep `@UsePipeline` available. |


The implementation agent must optimize for:

- one obvious normal path;
- typed declarative intent;
- safe defaults;
- first-class per-handler exceptions;
- no duplicated security-sensitive key mechanics;
- no behavior/persistence ordering knowledge required in ordinary application code;
- unchanged advanced capability.

Do not combine this work with D-01, D-02 or D-03.

## 3.1 S-01 — Generic per-handler global-behavior opt-out

Add a core decorator named `SkipPipeline` unless an existing naming convention discovered during implementation strongly requires an equivalent name.

Required contract:

```ts
@CommandHandler(InternalRebuildCommand)
@SkipPipeline(AuditBehavior)
export class InternalRebuildHandler {}
```

Implementation requirements:

1. Store skipped behavior identities in dedicated metadata.
2. Identity must use the same `getBehaviorId()` / `PIPELINE_BEHAVIOR_ID` rules as normal deduplication.
3. Remove skipped global behaviors before behavior resolution/DI lookup.
4. Skipping one behavior must not relocate or reorder the remaining chain.
5. A class that both skips and locally declares the same behavior is contradictory configuration; fail at bootstrap with a useful error rather than making decorator order decide.
6. Support command, query and event handlers.
7. Support singleton and scoped handlers.
8. Export the decorator as application API; do not expose additional internal skip metadata unless needed for advanced tooling.

Do not implement behavior-specific `enabled:false` across every package as the generic mechanism. Existing behavior-specific enable flags may remain.

## 3.2 S-02 — Typed intent entries with required handler intent

Add tiny package-owned builders that return the existing `PipelineBehaviorEntry` tuple shape. Do not introduce a second runtime or a central addon-aware policy object.

Important distinction:

- **module-default option types may remain partial**, because a module can provide shared fragments;
- **explicit handler-intent builders should make activation fields required** when the behavior would otherwise be inactive or unsafe.

Examples of the target contract:

```ts
@UsePipeline(
  authorize({ action: 'create', subject: 'User' }),
  featureFlag({ flag: 'user-registration' }),
  rateLimit({ keyFactory: perUserKey, points: 1 }),
  idempotent({ keyFactory: createUserKey }),
  cache({ key: userCacheKey, ttl: 30_000 }),
)
```

The exact helper names may differ, but require:

- cache handler intent to supply a key unless the caller explicitly chooses an advanced “inherit module key” form;
- rate-limit handler intent to supply a key factory unless explicitly inheriting a complete module policy;
- idempotency handler intent to supply a key factory unless explicitly inheriting a complete module policy;
- feature-flag handler intent to supply a flag;
- resilience builder types to keep replay/error-classification safety visible;
- options to stay tied to their owning behavior type at compile time.

Raw `[Behavior, options]` tuples remain the advanced/custom behavior escape hatch.

## 3.3 S-03 — Composite persistence lifecycle decorator

Introduce a high-level persistence decorator, recommended name `PersistedWrite`.

It must compose the current low-level lifecycle rather than replace its implementations.

Normal contract:

```ts
@PersistedWrite<User, UserSnapshot>({
  cache: {
    setKey: (user) => filterCacheKey(User, { id: user.id }),
    invalidateKeys: (user) => [
      filterCacheKey(User, { email: user.email }),
    ],
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

1. Default entity extraction is the first method argument.
2. Allow custom extraction for non-standard signatures.
3. Internally preserve canonical ordering:
   - persistence error translation around the database call;
   - acknowledgment only after successful persistence;
   - cache maintenance after successful acknowledgment.
4. If no unique/residual error mapping is configured, do not install a semantic no-op mapper.
5. Preserve cache barrier, CAS, TTL, serializer and existing best-effort/fail behavior exactly.
6. Preserve the low-level `@Cache`, `@AcknowledgePersisted`, and `@MapPersistenceErrors` exports.
7. Migrate users-api repositories only after decorator contract tests pass.

This simplification does not authorize externally managed transaction semantics. The current autocommit/commit-hook caveat remains.

## 3.4 S-04 — Domain-event publication behavior

Replace normal users-api dependence on `CommandBaseHandler` with one command pipeline behavior that publishes aggregate buffered events after successful handler execution.

Recommended name: `PublishDomainEventsBehavior`.

The behavior must recognize the same result shapes as current `CommandBaseHandler`:

- an `AggregateRoot`;
- an object with `aggregate: AggregateRoot`.

Required equivalence:

- handler failure -> publish nothing;
- successful aggregate-bearing result -> publish the same buffered events;
- clear/uncommit according to current successful publication behavior;
- publication failure remains a post-persistence application failure exactly as currently documented;
- non-aggregate result -> no-op.

Register it once as the innermost global command behavior so publication occurs at the same logical point as the current base-class implementation before outer behavior unwind observes completion.

After equivalence tests pass, migrate users-api command handlers to ordinary `ICommandHandler` classes and remove:

- `extends CommandBaseHandler`;
- `EventBus` constructor injection used only by the base class;
- `super(eventBus)`;
- `handle()` indirection when `execute()` is sufficient.

Keep `CommandBaseHandler` temporarily only if compatibility policy requires it; otherwise remove it in the same intentional breaking cleanup. This work does **not** change the D-01 in-memory/non-atomic event-delivery contract.

## 3.5 S-05 — Default no-op `afterUpdate`

Change `RootEntity.afterUpdate()` from abstract to an overridable default no-op hook.

Then remove empty overrides from current aggregates.

Do not alter:

- `@Mutate()` timing;
- version increment;
- updatedAt update;
- event recording.

## 3.6 S-06 — `optimisticDelete`

Add `optimisticDelete` beside `optimisticUpdate`.

It must own the repeated current algorithm:

1. reject unsupported external transaction mode consistently with update semantics if required by the contract;
2. delete by `id + expectedVersion`;
3. exactly one affected row -> success;
4. zero -> refreshed lookup;
5. absent -> `EntityNotFoundException`;
6. present -> `ConcurrencyConflictError`;
7. unexpected affected row count -> invariant error.

Migrate User/Role delete repositories and keep direct delete available for non-versioned/specialized adapters.

## 3.7 S-07 — Safe partition helpers

Do not let users-api manually compose tenant-sensitive key strings when a package helper can own the mechanics.

### Rate limiting

Migrate current manual users-api factories to `createPartitionedRateLimitKeyFactory` where semantics match.

### Idempotency

Add a symmetric helper, recommended shape:

```ts
createPartitionedIdempotencyKeyFactory({
  principal: (ctx) => ...,
  key: (ctx) => ...,
  // tenant required by default
})
```

The exact shape may differ, but must:

- fail closed on required tenant/principal absence;
- escape/join segments through core canonical helpers;
- keep business-operation identity explicit;
- compose with existing request fingerprint validation rather than replacing it.

Do not invent an automatic "hash the whole command and call it idempotency" default; identical request bodies can still represent intentionally distinct business operations.

## 3.8 S-08 — Remove unused users-api pipeline-cache wiring

Current users-api production code configures `CacheModule.forRoot` but has no `CacheBehavior` / `PIPELINE_CACHE` consumer. Repository caching is a separate ddd-core concern.

Remove from users-api:

- `CacheModule.forRoot(...)`;
- its `ReliabilityModule` export/import if no other production consumer appears during implementation.

Do not remove or weaken the standalone `@nestjs-pipeline/cache` package.

If an implementation agent finds a real current production consumer introduced after the review baseline, re-evaluate this item instead of deleting active wiring.

## 3.9 S-09 — Logging defaults and logger binding

In users-api composition:

1. Set the common `requestResponseLogLevel:'log'` once on global `LoggingBehavior`.
2. Remove identical per-handler logging tuples.
3. Keep handler-level deltas such as unique-error `mapLogLevel`; rely on the existing shallow global+handler option merge.
4. Bind `NativeLogger` with the dedicated `loggerProvider` option rather than `extraProviders`.

Do not remove `extraProviders` solely because the sample no longer needs it; public-surface cleanup belongs to S-14.

## 3.10 S-10 — Core observation bag; remove TelemetryBridgeBehavior

Create a tiny core-owned, telemetry-provider-neutral observation/attribute mechanism.

Required properties:

- addon behaviors can append semantic observations using only their existing core dependency;
- values are stored per `IPipelineContext`;
- OpenTelemetry trace behavior consumes them automatically;
- MetricsBehavior preserves its existing low-cardinality default and must not blindly copy unbounded request-local identifiers;
- addon packages must not gain an OpenTelemetry dependency;
- failures to add/export observations must never change business outcome.

Migrate current feature-flag/cache/idempotency/rate-limit/dead-letter observation writes and delete users-api `TelemetryBridgeBehavior` once equivalent trace attributes are proven.

Do not expose raw security-sensitive keys (cache/idempotency/rate-limit keys) as default telemetry attributes.

## 3.11 S-11 — Async static global behaviors

The current async module must know provider-graph classes before `useFactory` runs. Preserve that invariant.

Simplify configuration by allowing static `globalBehaviors` on `PipelineModuleAsyncOptions` so those classes can be registered before factory execution.

The async factory should then normally return dynamic values only:

- tenant factory;
- correlation factory/runner;
- dynamic runtime defaults if genuinely required.

Define deterministic merge rules if both static and factory global behavior configs are supplied. Prefer rejecting ambiguous duplicate placement rather than silently moving a security behavior.

## 3.12 S-12 — Repository-level cache hydration defaults

Allow `QueryRepository` to own default snapshot hydration/serialization policy.

Normal aggregate repository configuration should specify the hydrator once, then cached methods specify keys/TTL.

Requirements:

- current full `@FromCache({...})` remains supported;
- method-level options override repository defaults;
- aggregate-returning repository contracts must never leak cached raw snapshots;
- current mutation-barrier/CAS logic remains unchanged.

## 3.13 S-13 — Composable pipeline metadata

Implement only when needed for standalone policy decorators or multiple `UsePipeline` decorators.

Centralize metadata mutation so decorators:

- deduplicate using `BehaviorId`;
- preserve deterministic source order;
- merge behavior options under documented rules;
- do not accidentally overwrite previous pipeline metadata.

Do not change the semantics of one existing `@UsePipeline(...)` call.

## 3.14 S-14 — Narrow only true accidental public surface

Do **not** prune public APIs because `ddd/users-api` does not use them. The sample is an ergonomics specimen, not an external-consumer census.

High-confidence cleanup remains:

- deprecate/remove `originalCorrelationId` / `SET_ORIGINAL_CORRELATION_ID` when compatibility policy allows;
- converge tenant access on `context.tenantId`, with an explicit migration for `PIPELINE_TENANT_ID`;
- stop root/DynamicModule export of `PipelineBootstrapService`;
- use the public `CaslAuthorizerOptions` type consistently instead of maintaining a duplicate inline shape;
- remove repository-local semantic no-op decorator usage.

Retain unless a **specific API-quality problem** is demonstrated:

- `cacheKeyTemplate` — useful declarative/fail-fast key derivation;
- `RootEntity.from(...)` — useful polymorphic rehydration/type safety;
- `buildCache` / `buildKeyv`;
- audit/dead-letter record builders;
- resilience policy builder/context;
- feature evaluation helpers;
- public Zod raw/validated-data inspection helpers;
- useful convenience re-exports such as package-local `stableStringify` / `uuidv7`;
- addon context observation symbols;
- provider/store/transport interfaces and bundled adapters.

If discoverability becomes noisy, an `advanced` subpath may be considered, but moving public imports is still a compatibility change and must not be justified solely by sample usage.

## 3.15 S-15 — Bootstrap diagnostics and package-owned behavior contracts

Move deterministic policy mistakes from “first production request” to application bootstrap wherever possible.

Core must remain addon-agnostic. Define a small optional behavior contract/validator mechanism that an addon can expose without core importing that addon. The validator should be able to inspect:

- handler type/name;
- request kind;
- whether the behavior came from a global declaration, a handler declaration, or both;
- the effective handler/global behavior options visible to core;
- effective relative behavior order when an ordering constraint is declared.

Built-in diagnostics should cover at least:

- explicit CacheBehavior intent with no effective key;
- explicit RateLimitBehavior intent with no effective key factory;
- explicit IdempotencyBehavior intent that the developer expects to deduplicate but has no effective key factory;
- explicit FeatureFlagBehavior intent with no flag;
- contradictory `@SkipPipeline(Behavior)` plus local re-add;
- deterministic resilience safety violations that can be known from request kind/options;
- hard framework-owned ordering constraints introduced by built-ins.

Nuance: a globally installed behavior may intentionally be passive for handlers that do not opt into handler-specific options. Do not turn that pattern into an error. The validator needs declaration-source information so “global available, handler did not opt in” differs from “handler explicitly declared policy but forgot the activation field”.

Error messages must name:

1. handler;
2. behavior;
3. invalid/missing field or ordering;
4. one concrete remediation.

Do not silently auto-sort arbitrary custom behaviors. The framework may own hard safety edges for its own built-ins; semantic ordering of custom behaviors remains explicit.

## 3.16 S-16 — Typed pipeline context items

Keep `IPipelineContext.items` as the low-level interoperability bag, but add a typed layer so normal application/package code stops using magic strings and casts.

Recommended conceptual API:

```ts
const CURRENT_USER_ID = createPipelineItem<string>('currentUserId');

setPipelineItem(ctx, CURRENT_USER_ID, user.id);
const userId = getPipelineItem(ctx, CURRENT_USER_ID);      // string | undefined
const required = requirePipelineItem(ctx, CURRENT_USER_ID); // string or actionable error
```

Requirements:

- token identity is collision-safe;
- the value type travels with the token at compile time;
- `requirePipelineItem` fails with a message that identifies the missing item;
- built-in exported item constants can adopt the typed token shape without changing their identity semantics;
- raw `context.items.get/set` remains supported;
- do not create a central global registry or DI system.

Use typed accessors in new package examples and in safe key/actor/targeting factories where practical.

## 3.17 S-17 — Reusable pipeline presets / composed decorators

After S-13 provides safe metadata composition, add a small generic primitive for applications to define named recurring policy bundles once.

Target use case:

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

The exact API may differ. Required properties:

- preset expansion is ordinary pipeline metadata, not a second runtime;
- ordering is deterministic and inspectable;
- typed intent entries work inside presets;
- handler entries can extend/override under the same merge rules;
- bootstrap diagnostics see the expanded effective chain;
- app teams can own domain-specific presets;
- do **not** add a core `@Policies({...})` object that directly depends on every addon.

Raw `@UsePipeline` remains the escape hatch and the clearest option for one-off chains.

# 4. Simplification verification and migration discipline

Implement the track in small commits in this order unless a dependency requires a minor adjustment:

1. S-01;
2. S-02 typed intent declarations;
3. S-15 bootstrap diagnostics/behavior contracts;
4. S-16 typed pipeline items;
5. S-09 users-api cleanup;
6. S-08;
7. S-05/S-06;
8. S-03;
9. S-07;
10. S-13 when required for safe metadata composition;
11. S-17 reusable app-owned presets;
12. S-10;
13. S-04;
14. S-11;
15. S-12;
16. S-14 as a narrow intentional compatibility cleanup.

For every step:

- preserve current behavior with focused before/after tests;
- update users-api to demonstrate the simpler normal path, but never use lack of sample usage as evidence that an externally useful public API is dead;
- keep one advanced escape-hatch test;
- run package/unit checks for touched packages;
- run the relevant users-api E2E suites;
- run `pnpm check`, `pnpm lint:persistence`, and `pnpm test:release`;
- run `pnpm verify:all` before claiming the complete simplification track is done.

Do not interpret fewer lines as success if safety decisions become implicit. The acceptance test is that a users-api developer needs less framework implementation knowledge while all current capabilities remain available.


# 5. D-01 — Durable domain-event delivery / transactional outbox

**Status: DECISION REQUIRED. DO NOT IMPLEMENT WITHOUT OWNER APPROVAL.**

## 5.1 Existing contract to preserve until decision

CommandBaseHandler currently:

- executes the command;
- receives an aggregate-bearing result;
- publishes buffered events through Nest EventBus;
- clears the aggregate's uncommitted events;
- explicitly documents that database persistence and in-memory event publication are not atomic.

AGENTS.md explicitly says not to assume EventBus is an outbox.

This is a known limitation, not an accidentally missing retry.

## 5.2 Owner decision questions

Before any code, obtain explicit answers to:

1. Is durable event delivery actually required?
2. Which event classes/workflows require it: all domain events or only selected integration events?
3. Is at-least-once delivery acceptable?
4. Must aggregate write and outbox insertion be atomic in the same database transaction?
5. Which database owns the outbox in multi-tenant operation?
6. What is the target relay/transport: BullMQ, RabbitMQ, Kafka, database polling only, another broker?
7. Is per-aggregate ordering required?
8. Is global ordering required? Normally avoid promising it unless explicitly required.
9. What stable event identifier is used for deduplication?
10. Are consumers required to be idempotent?
11. What are retry/backoff/dead-letter semantics?
12. What is retention/cleanup policy?
13. What operational visibility is required?
14. Is the sample application expected to demonstrate the infrastructure or only the library contract?

Do not infer answers.

## 5.3 If the owner chooses NO

No production change is required.

Close D-01 by documenting the decision in Final.Review.md or a dedicated ADR if the repository uses one, preserving:

- in-memory EventBus semantics;
- explicit crash-window limitation;
- no durability claim.

Do not add an outbox port "for future use."

## 5.4 If the owner chooses YES

Do not start with CommandBaseHandler changes. First design transaction ownership.

Required invariant:

> The durable aggregate write and durable outbox record must commit atomically, or the design does not close the original failure window.

A compliant implementation will likely require persistence-layer transaction orchestration rather than a post-save application call.

### Required design artifacts before implementation

Define:

- durable OutboxRecord shape;
- event ID and aggregate identity/version fields;
- tenant partition/routing fields;
- serialized payload contract;
- created/available/attempted timestamps;
- delivery state and attempt count;
- relay ownership/lease mechanism if multiple workers run;
- deduplication contract;
- transaction boundary;
- mapper from in-memory domain event to durable record;
- relay port and infrastructure adapter;
- failure/retry/dead-letter behavior.

### Architecture boundaries

- Domain events remain framework-neutral data.
- CQRS handlers do not inject a concrete broker.
- Application code does not import BullMQ/RabbitMQ clients.
- Persistence code may own DB-specific transaction mechanics.
- Broker relay lives in infrastructure.
- Do not make Nest EventBus itself pretend to be durable.
- Do not duplicate event publication through both EventBus and outbox unless the owner explicitly defines the two-channel semantics.

### Tests required if YES

- aggregate write + outbox row commit together;
- failure before transaction commit persists neither;
- process-level relay can retry a durable pending record;
- duplicate relay attempts are safe;
- tenant routing is preserved;
- ordering guarantee matches the approved contract;
- cleanup does not delete pending records;
- application handler contains no concrete broker dependency.

Docker-backed database tests are required for the atomicity claim.

---

# 6. D-02 — ddd-core private Nest-oriented support vs framework-neutral reusable library

**Status: DECISION REQUIRED. DO NOT IMPLEMENT WITHOUT OWNER APPROVAL.**

## 6.1 Current contract

ddd/core/package.json says:

- package is private;
- description explicitly calls it Nest-oriented DDD support for sample applications;
- @nestjs/common and @nestjs/cqrs are runtime dependencies;
- MikroORM is isolated to the persistence entry point as an optional peer;
- domain/application/persistence subpath exports already make internal layering explicit.

RootEntity extends Nest AggregateRoot.

This is coherent with the current repository purpose.

## 6.2 Owner decision questions

1. Is there a real planned consumer that needs domain/application primitives without Nest?
2. Is ddd-core intended to become published?
3. Which primitives are desired outside Nest:
   - DomainException?
   - RootEntity?
   - DomainEvent/RootDomainEvent?
   - repository interfaces?
   - CommandBaseHandler?
   - cache interfaces?
4. Should @nestjs-pipeline/core remain Nest-specific? The current answer should normally remain yes unless explicitly changed.
5. Is introducing another package acceptable?
6. Is duplicated migration/import churn justified by a real reuse requirement?
7. Should persistence helpers remain private sample code or become separately publishable?

Do not convert the repository into a framework-independent CQRS framework as an abstract cleanliness exercise.

## 6.3 If owner chooses KEEP PRIVATE / NEST-ORIENTED

No architecture implementation is needed.

Preserve:

- three ddd-core entry points;
- direct Nest AggregateRoot use;
- optional MikroORM peer for persistence;
- current guardrails.

Optionally record the explicit decision so future reviews do not repeatedly reopen it.

## 6.4 If owner chooses EXTRACT FRAMEWORK-NEUTRAL PRIMITIVES

First produce an approved package-boundary plan. Do not immediately move files.

A valid plan must state:

- exact new package name(s);
- whether each package is public/private;
- dependency direction;
- which existing imports migrate;
- compatibility strategy;
- what happens to ddd-core root compatibility exports;
- where Nest-specific adapters live.

### Key design constraint

If RootEntity is moved into a framework-neutral package, it cannot extend @nestjs/cqrs AggregateRoot.

Therefore event buffering must be represented by a small own abstraction whose API is driven by current repository needs, not by recreating all CQRS concepts.

Possible required surface, only after approval:

- apply/record event;
- getUncommittedEvents;
- clear/uncommit events.

Then a Nest-oriented application/handler adapter can publish those events.

Do not hide @nestjs/cqrs behind a broad "mediator" interface if the only consumer remains Nest. Abstraction must be smaller than the dependency it replaces.

### Migration tests if extraction is approved

- domain package imports load without Nest installed;
- no MikroORM import loads through the domain/application entry;
- existing users-api handlers still compile through approved entry points;
- event buffering/publication semantics remain equivalent;
- packed artifact tests cover any newly published package;
- package-boundary Grit/tests are updated.

---

# 7. D-03 — Strict aggregate encapsulation vs direct MikroORM accessor mapping

**Status: RESOLVED (OWNER APPROVED: RETAIN DIRECT MAPPING WITH STATIC LINTER GUARDS).**

## 7.1 Implemented contract

1. Direct mapping (`accessor: true`) is retained in MikroORM EntitySchemas for zero-boilerplate simplicity (no persistence records or mappers).
2. Hydration setters on `RootEntity`, `User`, and `Role` are strictly annotated with `@internal` and `@deprecated` JSDoc tags.
3. Build-time enforcement is active via `biome/plugins/aggregate-identity.grit`, rejecting any direct setter assignments across `cqrs/`, `application/`, `controllers/`, `services/`, `mappers/`, and `jobs/`.
4. Domain invariants, versioning, and event tracking are preserved by requiring mutations to go exclusively through domain methods and factories.

## 7.4 If owner chooses STRICT ENCAPSULATION

Design persistence records before touching RootEntity.

A compliant migration should separate:

- domain aggregate state and invariants;
- persistence record shape;
- mapper/hydrator;
- MikroORM EntitySchema target.

### Required migration sequence

1. Define persistence record types/classes in persistence/infrastructure.
2. Map MikroORM schemas to records rather than domain aggregates.
3. Add record -> snapshot/domain rehydration mapping.
4. Add domain snapshot -> persistence record mapping.
5. Migrate query repositories.
6. Migrate write-side repositories.
7. Verify optimistic update/delete version predicates operate on records correctly.
8. Verify cache snapshot contracts remain detached and serializable.
9. Only after all persistence paths no longer need the setters, remove/restrict domain hydration setters.
10. Update positive examples and boundary tests.

### Required tests

- rehydration preserves id/timestamps/version;
- new aggregate creation semantics unchanged;
- update/delete optimistic concurrency unchanged;
- repository cache snapshots unchanged;
- no application layer imports persistence records;
- domain package no longer exposes persistence-only mutation escape hatches;
- E2E user/role/auth CRUD remains green.

Do not use synthetic domain instances merely to satisfy repository APIs.

---
