# Final Repository Review — review/remaining-findings

**Review baseline:** review/remaining-findings @ 04e3cc9b74006950017fc8ef777b4086f4b637e0  
**Review date:** 2026-09-19  
**Scope:** all historical review material under docs/reviews, the R-01 through R-08 implementation commits, current AGENTS.md, .agents/skills/nestjs-pipeline-architecture/SKILL.md, current package/application documentation, the reusable package production surfaces, and the source delta from f855d17 through the current branch head.

This document is the single current review source of truth. The historical Astra, ChatGPT, Claude, Gemini, package-wide, aggregate, execution, instruction, and simplification review material has been consumed into this file. `docs/reviews/LLM.Agent.Implementation.Brief.md` remains the separate executable companion for implementation agents; it must implement this review rather than redefine its findings or resolve decision-gated items.

## Verification method and current branch assessment

The implementation commits were not accepted from commit messages alone. Their source changes and regression-test structure were checked against the original contracts.

R-01 is correctly implemented: users-api production imports are migrated to the domain/application/persistence ddd-core entry points and the root-barrel/persistence boundary is mechanically guarded.

R-02 is correctly implemented: JwtAuthenticator no longer exposes a protected production method solely for a unit test; the test observes the real JOSE module boundary instead.

R-03 is correctly implemented: RootDomainEvent no longer retains the live aggregate reference. Event-time payload, aggregateId, and aggregateVersion remain, and the originating aggregate is not frozen.

R-04 is correctly implemented: generated Zod requests and ZodValidationBehavior share the same plain-record application helper and preserve explicit own properties whose parsed value is undefined.

R-05 / E-01: one automatic release script discovers all publishable packages, checks tarball identity and contents, and generates imports for isolated TypeScript/runtime verification. Core behavior and lifecycle fixtures and the CASL 7 fixture remain. The owner explicitly chooses CASL 7-only compatibility and minimal manual maintenance.

R-06 / E-02: AGENTS.md and the architecture skill consistently use ConcurrencyConflictError and explicitly describe the persistence-to-application boundary, HTTP 409 mapping, and separate missing-row and unique-constraint outcomes.

R-07 is correctly implemented. The new composition suite uses the real exported behaviors for DeadLetter/Resilience, FeatureFlag/Cache, and Resilience/Idempotency and includes a Nest CQRS composition path.

R-08 added the expected command surface and records a complete local verification run, but this review did not independently execute the workspace or Docker-backed suites. GitHub exposes no workflow run or commit status for the current head, so the execution claim belongs in Table 3 rather than being silently accepted.

The current-state scan did not identify another source-level correctness or security defect that survives the existing fixes. A separate simplification pass at source baseline `122f5356c18f003a6e421076bea3736c5b2adcd3` identified application-facing boilerplate, unused **sample** wiring, a small amount of true compatibility/implementation leakage, and safer declarative APIs that can reduce complexity without removing capabilities. A follow-up library-wide review explicitly treats `ddd/users-api` only as an ergonomics specimen: absence of an in-repository sample consumer is not evidence that a public helper or extension point should be removed. Those findings are fully incorporated below. The three architecture issues remain deliberate human decisions rather than implementation-agent choices.

## Table 1 — Executable findings and implementation status

| ID | Priority | Finding | Exact current location | Why it remains open | Required implementation / completion criterion |
|---|---|---|---|---|---|
| E-01 | P1 — release confidence | Automatic coverage of every published package. | integration/packages/release.mjs; integration/packages/consumer; package.json test:release | Implemented under the owner-approved single-script, CASL 7-only scope. | Manifest discovery generates all imports and tarball dependencies; exact installed external peer versions and their required peers are derived automatically. Archive identity, contents, strict installation, TypeScript, runtime loading, core lifecycle, and CASL authorization are checked. See integration/packages/README.md for coverage limits. |
| E-02 | P1 — instruction consistency | Framework-neutral version-conflict contract. | AGENTS.md rule 13; architecture skill, Optimistic updates and conditional deletes | Implemented; terminology verified against production code. | Both instructions use ConcurrencyConflictError, preserve EntityNotFoundException, and explain HTTP 409 mapping without changing unique-constraint handling or production behavior. |

## Table 2 — Open architecture/product decisions; implementation must wait for an explicit human choice

| Decision ID | Decision required | Exact current location | Current deliberate contract and trade-off | Decision packet / what must be chosen before code changes |
|---|---|---|---|---|
| D-01 | Whether durable domain-event delivery / a transactional outbox is a product requirement. | ddd/core/application/command-base.handler.ts:93-105 documents in-memory EventBus delivery and the crash window; :111-119 publishes buffered events after handler success. AGENTS.md rule 10 explicitly says not to assume a transactional outbox. | Database persistence and Nest EventBus publication are not atomic. A process failure after commit can lose an event. This is explicitly documented and is not repairable by a local retry wrapper or by writing an outbox after the repository has already committed. | Decide whether the system needs durable at-least-once delivery, which commands/events require it, whether aggregate write plus outbox row must share one database transaction, target relay/broker semantics, tenant routing, ordering requirements, stable event IDs, duplicate handling/idempotent consumers, retention, and operational ownership. Until that decision is made, preserve the current honest in-memory semantics and do not add a fake outbox abstraction. |
| D-02 | Resolved via Option C ("Own the Aggregate Primitive"). | ddd/core/domain/models/aggregate-root.ts; ddd/core/domain/events/event.interface.ts; ddd/core/domain/models/root.entity.ts | AggregateRoot semantics (NestJS 12 compatible) are vendored and owned directly inside ddd-core/domain. Domain layer loads zero @nestjs and zero @mikro-orm modules while maintaining 100% aggregate API compatibility. Application layer retains Nest CQRS integration. | Resolved: Owned aggregate root primitive implemented in domain, eliminating NestJS from domain layer without multi-package fracturing. |
| D-03 | Resolved via static guardrails (Retain Direct Mapping with Biome Grit Guard & @internal/@deprecated annotations). | ddd/core/domain/models/root.entity.ts; ddd/users-api/src/users/domain/models/user.entity.ts; ddd/users-api/src/roles/domain/models/role.entity.ts; biome/plugins/aggregate-identity.grit | Retained direct MikroORM aggregate mapping (`accessor: true`) for zero-boilerplate simplicity, while strictly eliminating developer mutation risk via build-time Biome Grit plugin (`biome/plugins/aggregate-identity.grit`) and `@internal`/`@deprecated` JSDoc annotations on all hydration setters. | Resolved: Direct mapping retained with build-time linter enforcement forbidding direct setter assignments in application, CQRS, controller, and service layers. |

## Table 3 — Historical/current claims that cannot be independently confirmed from repository source state

| Verification ID | Claim / unresolved evidence question | Source locations that define the gate | What was verified from code | What is not independently verified and what evidence would close it |
|---|---|---|---|---|
| V-01 | Full verification execution evidence. | package.json verify:all; docs/reviews/Verification.E01.E02.md | Fresh local gate passed on the identified working tree: lint, unit tests, builds, 12 packed consumers, core/CASL 7 fixtures, and 27 E2E files / 136 tests with PostgreSQL and Redis; no skipped tests. | Local execution evidence is captured with the base commit and input hashes. No final implementation commit or CI status is claimed. |


## Detailed simplification review — S-01 through S-17

**Simplification source baseline:** `122f5356c18f003a6e421076bea3736c5b2adcd3`  
**Review date:** 2026-09-19  
**Implementation companion:** `docs/reviews/LLM.Agent.Implementation.Brief.md`

This section is the consolidated simplification review. `ddd/users-api` is only an ergonomics specimen: lack of an in-repository sample consumer is not evidence that a public library API is useless. The goal is to make developers declare intent while the framework owns repeatable mechanics, safe defaults, ordering, diagnostics, and common failure prevention, without removing legitimate advanced extension points.

### Review method

The current branch tree was scanned across the production TypeScript surface:

- 163 production `ddd/users-api/src/**/*.ts` files;
- 37 production `ddd/core/**/*.ts` files;
- 125 production `packages/*/src/**/*.ts` files;
- all package root exports, module options, pipeline composition code, persistence decorators/helpers, and the current users-api composition modules and representative handlers/repositories.

Search results were then checked against branch-specific source rather than default-branch snippets.

`ddd/users-api` is used only as an **ergonomics specimen**: it shows what a normal application currently has to write and remember. Absence of an in-repository users-api consumer is **not** evidence that a public library API is useless. Public-surface decisions below are based on whether an API is a coherent reusable capability or extension point for external consumers, not on sample usage counts.

The public Nest CQRS 11 surface was also checked before suggesting a rewrite of the core bootstrap. CQRS 11 exposes configurable publishers and request-scoped handler support, but not a public cross-command/query/event handler middleware/interceptor API equivalent to this repository's behavior pipeline. The current private ExplorerService/prototype integration therefore remains a managed implementation cost rather than an obvious simplification target.

### Design rules for simplification

Every proposal below must satisfy all of these:

1. **No feature reduction.** Existing low-level behavior/decorator APIs remain available as escape hatches unless an item is explicitly identified as dead/compatibility-only.
2. **Intent over mechanics.** Application code should state "authorize", "audit", "cache", "idempotent", "persist" rather than manually reproduce framework ordering or key construction.
3. **Safe by default.** Security-sensitive defaults must fail closed; simplification must not create shared cache/rate-limit/idempotency namespaces.
4. **One obvious happy path.** Advanced forms may remain, but normal application code should not have multiple equivalent ways to wire the same feature.
5. **Per-handler override must be first class.** A global behavior must be overridable and, when explicitly requested, removable for one handler without composition tricks.
6. **Do not hide domain decisions.** Loaded-entity authorization, transaction/outbox semantics, and actual persistence operations stay explicit where hiding them would weaken correctness.
7. **Preserve framework escape hatches.** A developer must still be able to use raw `@UsePipeline`, individual persistence decorators, custom policies/stores/providers, or a custom behavior when a special case requires it.
8. **The sample is not the public-API oracle.** A helper can be valuable even when users-api does not need it. Remove public surface only when it is compatibility-only, implementation leakage, duplicated with no ergonomic value, or actively increases misuse risk.

---

### Table 4 — Highest-value simplifications

| ID | Priority | Current evidence | Current cost / misuse risk | Simpler target with same or better capability | Escape hatch / preserved behavior | Breaking change / migration impact |
|---|---|---|---|---|---|---|
| S-01 | P0 | `packages/pipeline/src/services/pipeline.bootstrap.service.ts`; `globalBehaviors` merge has override but no generic removal. Only Trace/Metrics expose `enabled:false`. | A behavior can be global and handler options can override it, but there is no universal way to say "this handler must not run AuditBehavior/Logging/etc." Developers must abuse behavior-specific options or restructure global scopes. | Add `@SkipPipeline(...BehaviorTypes)`. During bootstrap, remove matching globally-applied behaviors by `BehaviorId` before the chain is built. This directly supports "global audit except these commands". | Raw global scopes and handler-level `@UsePipeline` remain. Define one deterministic rule: explicit skip wins; contradictory skip + local re-add should fail at bootstrap rather than be order-sensitive. | **No — additive.** Adds a new decorator/metadata path; existing global and handler behavior composition is unchanged until a handler opts into `@SkipPipeline`. |
| S-02 | P0 | `PipelineBehaviorEntry` currently stores tuple options as `Record<string, unknown>`. Several behavior option interfaces also keep execution-critical fields optional because the same type is reused for module defaults (`CacheBehaviorOptions.key`, rate-limit/idempotency key factories, feature-flag key). | Raw tuples do not encode which option type belongs to which behavior, and a handler can look protected while omitting the one field that actually activates the policy. | Keep one ordered `@UsePipeline(...)`, but add **typed intent entry builders** from each package. Handler-intent builders should use stricter declaration types than module-default interfaces: e.g. `cache({ key, ... })`, `rateLimit({ keyFactory, ... })`, `idempotent({ keyFactory, ... })`, `featureFlag({ flag, ... })`. Module defaults may stay partial; an explicit handler intent should make its required intent compile-time obvious. | Raw `[Behavior, options]` remains for custom/advanced behaviors and for advanced cases that deliberately inherit all required values from module defaults. The runtime shape and execution model stay unchanged. | **No — additive.** Typed builders sit on top of the existing tuple runtime shape. Raw tuples remain supported, so existing handlers do not need migration. |
| S-03 | P0 | users-api write repositories repeatedly stack `@Cache` → `@AcknowledgePersisted` → `@MapPersistenceErrors`; the order is a documented correctness invariant and the entity extractor is repeated. | A normal repository write requires remembering decorator order, repeating `entity: ([entity]) => entity`, and sometimes installing a no-op mapper. The API lets callers express the lifecycle incorrectly. | Add a composite `@PersistedWrite({...})` decorator that internally applies the canonical lifecycle in the only correct order. Default entity selector is the first method argument. Options expose cache policy, unique mappings, optional residual error mapping, acknowledgment and barrier/CAS settings. | Keep `@Cache`, `@AcknowledgePersisted`, and `@MapPersistenceErrors` exported for unusual method signatures or custom ordering that is intentionally owned by the caller. | **No — additive if low-level decorators remain.** Migrating repositories is source-only cleanup. Removing `@Cache`, `@AcknowledgePersisted`, or `@MapPersistenceErrors` later would be a separate public API break and is not part of this proposal. |
| S-04 | P1 | Seven current command handlers extend `CommandBaseHandler`, inject `EventBus`, pass it to `super`, and return an aggregate-bearing result only so the base class can publish buffered events. | Cross-cutting post-success event publication creates inheritance and constructor boilerplate in every command handler. It also couples normal handler shape to one lifecycle implementation. | Move the existing aggregate-bearing-result publication logic into a `PublishDomainEventsBehavior` registered once for commands at the innermost global position. Handlers become ordinary `ICommandHandler` classes and simply return the same result they already return. | Preserve the exact current in-memory EventBus semantics and crash window. `@SkipPipeline(PublishDomainEventsBehavior)` or a raw custom handler is the escape hatch. This does **not** decide D-01/outbox. | **Potential source/API break.** Adding the behavior is non-breaking, but removing `CommandBaseHandler` breaks consumers that extend it. Implement in two phases: behavior + migration first; remove/deprecate the base only in an intentional breaking release. Runtime event semantics must remain identical. |
| S-05 | P1 | `RootEntity.afterUpdate()` is abstract; User, Role, Auth and Capability currently provide empty implementations. | Every aggregate must implement an empty hook even when it has no post-mutation lifecycle work. | Give `RootEntity.afterUpdate(): void {}` a default no-op implementation and keep it `protected`/overridable. | Aggregates with real lifecycle work override it exactly as today. | **No.** Changing an abstract hook to a concrete no-op is source-compatible; existing overrides still work. Removing empty overrides in users-api is internal cleanup only. |
| S-06 | P1 | `DeleteUserCommandRepository` and `DeleteRoleCommandRepository` repeat version-conditioned `nativeDelete`, diagnostic refreshed read, `ConcurrencyConflictError` / `EntityNotFoundException` selection. | The repository has an `optimisticUpdate` helper but no corresponding delete helper, so a safety-critical algorithm is copied into each delete repository. | Add `optimisticDelete(em, Entity, aggregate, entityName)` beside `optimisticUpdate`. Repositories keep their actual persistence decision but stop re-implementing concurrency diagnosis. | Callers can still issue custom deletes directly for non-versioned or special cases. | **No — additive.** New helper only. Migrated repositories must preserve the exact delete/conflict semantics. |
| S-07 | P1 | Rate-limit package already has `createPartitionedRateLimitKeyFactory`; users-api still manually concatenates tenant/request/email keys and calls `requireTenantId`. Idempotency has no symmetric secure partition helper. | Security-sensitive key construction is duplicated application code, including delimiter composition and missing-tenant handling. This is exactly the category where small mistakes become cross-tenant bugs. | Use the existing partitioned rate-limit helper in users-api and add a symmetric `createPartitionedIdempotencyKeyFactory` with explicit tenant/principal/request identity inputs and fail-closed defaults. Keep cache's dedicated `createPartitionedCacheKeyFactory` because cache additionally needs permission-scope semantics. | Arbitrary `keyFactory` remains available for genuinely unusual key semantics. | **Operational key-namespace change possible.** API addition is non-breaking, but migrating an existing deployed key factory can produce different escaped/canonical keys, causing fresh rate-limit buckets or new idempotency records. Treat key format as migration-sensitive; version or explicitly accept the reset. |
| S-08 | P1 | `ReliabilityModule` calls `CacheModule.forRoot(...)`, but there are **zero production users-api references to `CacheBehavior` or `PIPELINE_CACHE`**. Repository caching instead uses ddd-core `@FromCache` / `@Cache` and a separate `CACHE_TOKEN` / `MikroOrmCache`. | The sample boots/configures a second caching subsystem that does no work, making the architecture look more complicated and suggesting the two cache layers are connected when they are not. | Remove `@nestjs-pipeline/cache` registration/export from users-api until an actual handler/read-model cache uses it. Keep the package itself unchanged. If the sample later needs handler-result caching, add one real consumer and document the distinction. | Repository caching remains exactly as today; the standalone pipeline-cache package remains a published feature. | **Users-api composition break only.** No package API is removed, but code that imports `ReliabilityModule` specifically to receive its `CacheModule` re-export would need to import/configure cache itself. Current production users-api behavior is otherwise unchanged because the pipeline cache has no consumer. |
| S-09 | P1 | users-api declares `requestResponseLogLevel:'log'` on roughly every logged handler even though LoggingBehavior is global. `ObservabilityModule` also binds `LOGGING_BEHAVIOR_LOGGER` through `extraProviders` despite a dedicated `loggerProvider` option. | Repeated policy defaults obscure the few handlers that actually differ. Generic provider escape hatches are used for a first-class option. | Put `[LoggingBehavior,{requestResponseLogLevel:'log'}]` in the global behavior configuration. Handler declarations then contain only real deltas such as `mapLogLevel`. Bind NativeLogger through `loggerProvider`, not `extraProviders`. | Per-handler logging options continue to shallow-merge over global defaults. `extraProviders` remains only if another real use exists. | **Behavior/config change possible.** Moving logging options global can change effective log level/volume for handlers that previously relied on package defaults. Verify the effective option set handler-by-handler; `loggerProvider` migration itself is non-breaking. |
| S-10 | P1 | users-api owns a ~100-line `TelemetryBridgeBehavior` whose only job is to read addon `context.items` symbols and copy them into the OTel attribute bag. | Every application wanting integrated telemetry must know internal addon symbols and repeat the same glue. Package independence is preserved, but integration burden leaks to the consumer. | Move a tiny transport-neutral "pipeline observations/attributes" bag/helper into core. Addon behaviors write their own semantic observations through core (they already depend on it). OTel reads that bag automatically. Delete the app-specific bridge. | Addons still take no OpenTelemetry dependency. Trace/metrics custom `attributeFactory` remains for application-specific enrichment. Metrics keep current cardinality safeguards. | **No intended break if telemetry names/items are preserved.** Adding the core observation bag is additive. Removing existing exported addon item symbols or changing emitted attribute names would be a separate API/observability-contract break; keep compatibility through migration. |
| S-11 | P2 | `PipelineModule.forRootAsync` cannot infer providers from `globalBehaviors` returned by the async factory, so the sample lists behavior classes statically and again in runtime composition. | The distinction is technically valid but looks like duplicate configuration and is easy to misunderstand. | Allow **static** `globalBehaviors` on `PipelineModuleAsyncOptions`; auto-register those behavior classes exactly like synchronous `forRoot`. Let `useFactory` return only values that are actually dynamic (tenant/correlation/etc.). Merge static and factory runtime options deterministically. | Keep `behaviors` for handler-only custom behavior registration and keep the existing async factory form for cases where behavior composition itself genuinely depends on injected runtime config. | **No — additive if old async configuration remains valid.** Existing `behaviors` + factory-returned `globalBehaviors` must continue to work. Do not retroactively reject previously valid configurations. |
| S-12 | P2 | `QueryRepository` stores only `cache`; each aggregate query repeats `hydrateFn: User.fromJSON/Role.fromJSON` and `alwaysHydrate:true` in `@FromCache`. | Rehydration is repository identity, not normally a per-method decision. Repeating it increases the chance that one cached path leaks snapshots while another returns aggregates. | Allow `QueryRepository` to receive an optional repository-level serializer/hydrator policy once. `@FromCache` then normally declares only the key/TTL. Method-level serializers/hydrators remain overrides. | Existing full `@FromCache({...})` stays valid for mixed-result repositories or specialized cache shapes. | **No if repository defaults are optional.** Existing full `@FromCache({...})` usage must remain valid. Making a new constructor argument mandatory would be a source break and should be avoided. |
| S-13 | P2 | `UsePipeline` writes class metadata with `Reflect.defineMetadata`; repeated `@UsePipeline`-style decorators would overwrite rather than compose. | This blocks safe package-level decorator sugar and makes future declarative decorators fragile. | Add one internal metadata merge primitive with dedupe by `BehaviorId`, deterministic top-to-bottom source order, and option merging rules. `UsePipeline`, typed intent decorators, and `SkipPipeline` all use it. | A single current `@UsePipeline(...)` behaves exactly as before. | **Behavior break for code that currently stacks multiple pipeline decorators.** A single `@UsePipeline(...)` remains unchanged, but code that intentionally relied on later metadata overwriting earlier metadata would start composing instead. Treat the new multi-decorator behavior as an explicit semantic change and test/document ordering. |
| S-14 | P2 | Root barrels expose a small amount of true core implementation/compatibility machinery, but the wider package roots also expose legitimate extension helpers that external consumers may use even when users-api does not. | Treating “no in-repo production consumer” as a deletion signal would make the framework less reusable and would remove useful escape hatches. The real problem is only accidental implementation leakage and duplicate compatibility state. | Narrow only **high-confidence implementation leakage/compatibility surface**: `PipelineBootstrapService`, redundant correlation/tenant compatibility state when a migration path exists, and duplicated public type shapes. Keep coherent builders, serializers, record constructors, adapters, provider/store/transport interfaces, and convenience re-exports when they form a useful standalone API. See Table 3. | Public advanced APIs can remain at the package root or move to a documented advanced subpath only for discoverability; movement must not be justified solely by users-api usage. | **Yes for symbols actually removed or moved.** Do this only in an intentional breaking release or with compatibility re-exports/deprecations. |
| S-15 | P0 | Several built-ins discover deterministic misconfiguration only on the first request, and some intentionally pass through when critical intent is absent: Cache throws at runtime without a key; rate limiting requires a key factory; Idempotency silently passes through without one; FeatureFlag passes through without a flag; resilience has request-kind safety constraints. | The developer must remember which fields are “really required”, which no-op is intentional, and which ordering/scope combinations are safe. A configuration can compile and boot while a policy the developer thought was active is actually inactive. | Add a **package-owned behavior contract / bootstrap diagnostics hook**. Core stays addon-agnostic: each behavior may expose validation metadata or a validator that receives the effective handler/global declaration and request kind. Validate deterministic errors at bootstrap with actionable messages naming handler, behavior, missing option, and fix. Include hard safety-order constraints where the framework can know them; do not silently auto-reorder arbitrary custom behaviors. | Advanced/custom behaviors may omit the contract. Global “available for handler overrides” patterns can explicitly allow passive no-op; an explicit handler intent missing its activation field should fail fast. Runtime validation remains a backstop for values that truly depend on the request. | **Additive initially. Behavioral tightening when strict diagnostics become default.** Introduce diagnostics with compatibility mode/warnings if needed, then make deterministic built-in misconfiguration fail at bootstrap in a documented breaking or major policy change. |
| S-16 | P1 | `IPipelineContext.items` is `Map<string | symbol, unknown>`. Current package examples repeatedly do `ctx.items.get('userId') as string | undefined`; built-ins export raw symbols whose value type is not carried by TypeScript. | Cross-behavior context sharing requires magic strings, casts, and remembering which symbol stores which type. Misspelled keys become `undefined` and security key factories may fail far from the producer. | Add **typed pipeline item tokens/accessors**, e.g. `createPipelineItem<T>()`, `getPipelineItem`, `setPipelineItem`, and `requirePipelineItem`. Built-in item constants should carry their value type. `requirePipelineItem` should fail with an actionable producer/consumer message. Keep the raw `items` map as the low-level escape hatch. | Custom code can still use raw symbols/strings. Typed items are an ergonomic/safety layer, not a closed registry and not a new dependency-injection system. | **No — additive.** Existing `context.items` remains valid; built-in symbols can be typed compatibly. |
| S-17 | P1 | Global behaviors remove much repetition, but applications with several recurring non-global policy bundles still have to repeat the same ordered `@UsePipeline(...)` entries on many handlers. `UsePipeline` metadata currently also makes ad-hoc composed decorators unsafe until S-13. | Teams either duplicate policy stacks or create custom decorators that can accidentally overwrite metadata/order. The developer must remember the canonical stack every time. | After S-13, expose a small **pipeline preset/composed-decorator primitive** so applications can define a named policy bundle once and reuse it. The framework should preserve/validate the resulting metadata and ordering. Prefer app-owned named presets over a giant core `@Policies({...})` that knows every addon. | Raw `@UsePipeline` remains fully available; presets expand to ordinary entries and remain inspectable. Per-handler typed entries can extend/override a preset under deterministic merge rules. | **No — additive.** Existing decorators remain unchanged; only code opting into presets uses the new composition path. |

---

### Table 5 — Immediate users-api cleanup requiring little or no framework redesign

These are concrete current-state changes, not speculative new abstractions.

| ID | Current location | Simplification | Why safe | Breaking change / migration impact |
|---|---|---|---|---|
| A-01 | `ddd/users-api/src/infrastructure/reliability.module.ts` | Remove `CacheModule.forRoot(...)` and `CacheModule` export until a real `CacheBehavior` consumer exists. | Current production users-api has zero `CacheBehavior` / `PIPELINE_CACHE` consumers; repository cache uses ddd-core independently. | **Potential users-api module API break.** Only consumers relying on `ReliabilityModule` to re-export pipeline cache need migration; no current users-api runtime feature is lost. |
| A-02 | `ddd/users-api/src/infrastructure/observability.module.ts` | Use `loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: NativeLogger }` instead of `extraProviders` for this binding. | It is the purpose-built current API. | **No.** Equivalent provider binding through the dedicated option. |
| A-03 | same + logged handlers | Configure `LoggingBehavior` global default `requestResponseLogLevel:'log'`; remove identical local logging tuples. Keep local `mapLogLevel` only where it differs. | Current bootstrap already shallow-merges handler options over global options while preserving global position. | **Behavior/config change possible.** Effective logging must be compared so previously quieter handlers do not become noisier unintentionally. |
| A-04 | `ddd/users-api/src/users/persistence/update-user.command-repository.ts` | Remove `@MapPersistenceErrors({ unique: [] })` when it has no `otherwise`. | Current decorator catches and rethrows the same unmatched error; it changes no behavior. A future composite persistence decorator should simply omit error mapping when no mapping exists. | **No.** The removed decorator instance is semantically pass-through for current configuration. |
| A-05 | User/Role/Auth/Capability aggregates | Remove empty `afterUpdate(): void {}` implementations after the base hook becomes a no-op. | No semantic change. | **No.** Requires S-05 first; runtime lifecycle is unchanged. |
| A-06 | user/role delete repositories | Replace copied optimistic-delete algorithm with one ddd-core helper. | Same conditional delete and diagnostic semantics; less duplicated safety code. | **No intended break.** Internal deduplication of the same optimistic-delete semantics. |
| A-07 | create-user/create-auth rate-limit factories | Replace manual tenant-delimited strings with `createPartitionedRateLimitKeyFactory`. | Existing package helper already owns escaping and missing-tenant policy. | **Operational key-namespace change possible.** Existing limiter keys may change format, resetting buckets. Preserve/version key format if continuity matters. |
| A-08 | `TelemetryBridgeBehavior` | Delete after addons write standardized core observation attributes directly. | Same trace enrichment with less application-specific glue. | **No intended break if emitted OTel attribute names/values stay identical.** Removing or renaming exported observation symbols later is a separate API break. |

---

### Table 6 — Public-surface classification: sample usage is not a deletion criterion

A public library API is not dead merely because `ddd/users-api` does not call it. This table now classifies each candidate by **external library value**. “Remove” is reserved for true implementation leakage, compatibility duplication, or repository-local no-ops.

| ID | Surface | Library value outside users-api | Recommendation | Breaking change / migration impact |
|---|---|---|---|---|
| U-01 | `IPipelineContext.originalCorrelationId`, backing field, `SET_ORIGINAL_CORRELATION_ID` | Low. It is documented as a compatibility alias for the already-immutable initial `correlationId`; it does not provide a second lifecycle concept anymore. | Deprecate/remove in the next intentional breaking cleanup. Keep `correlationId` as the single concept. | **Yes — public API/source breaking.** Consumers reading/importing the alias must migrate to `correlationId`. |
| U-02 | `PIPELINE_TENANT_ID` item mirror plus `SET_TENANT_ID` writing both the property and item bag | Low-to-medium compatibility value. Custom behaviors may read the symbol, but `context.tenantId` is the typed canonical API and duplicate state creates divergence risk. | Prefer `context.tenantId`; deprecate the public mirror before removal. Keep the setter/internal propagation mechanism private. | **Yes if removed.** External behaviors reading the item symbol must migrate to `context.tenantId`. |
| U-03 | root/DynamicModule export of `PipelineBootstrapService` | Very low consumer value. It is framework patching machinery, not an extension contract; external injection couples callers to private Nest-CQRS integration details. | Stop exposing it publicly; keep it an internal provider of `PipelineModule`. | **Yes — public API/DI breaking** for direct import/injection. |
| U-04 | `CaslAuthorizerOptions` while constructors repeat inline `{ bypass?: boolean }` | **Useful public type.** External consumers constructing/configuring authorizers benefit from one named shape. | **Retain and use it in the constructor/static API** instead of deleting it. Remove the duplicated inline shape, not the public capability. | **No** if signatures are rewritten to the equivalent named type. |
| U-05 | `cacheKeyTemplate` | **Useful declarative API.** It removes manual key concatenation, namespaces by tenant, canonicalizes values, and fails fast when required placeholders are missing. This is exactly the kind of “framework remembers the mechanics” helper the project should favor. | **Retain and document as a normal persistence-cache helper.** Do not remove because the current sample may not need it in production code. | **No change recommended.** Removing it would be source-breaking and counter to the simplification goal. |
| U-06 | `RootEntity.from(...)` polymorphic rehydration | **Useful ergonomic/safety helper** for adapters that may receive either an already-hydrated aggregate or a snapshot. It also rejects incompatible aggregate instances rather than guessing. | Retain unless a future repository-level hydration contract makes it genuinely redundant across external use cases. S-12 may reduce its frequency, not its value. | **No change recommended now.** Removal would be source-breaking. |
| U-07 | `buildCache`, `buildKeyv`, `buildAuditRecord`, `buildDeadLetterRecord`, `buildResiliencePolicy`/`PolicyBuildContext`, feature-evaluation helpers, public Zod inspection helpers | **Legitimate advanced extension points.** They let custom modules/adapters reuse package-owned normalization, redaction, policy construction, optional-adapter diagnostics, or validated/raw request state without copying internals. | **Retain as documented advanced APIs** unless a specific helper exposes unstable private state. Optionally group them under an advanced subpath for discoverability only if compatibility is preserved. Do not prune as a set. | **No change recommended.** Moving/removing root exports would be source-breaking unless compatibility re-exports remain. |
| U-08 | convenience re-exports such as `stableStringify` from cache/idempotency and `uuidv7` from correlation | **Real ergonomic value:** a consumer can stay within the package it is using instead of knowing which lower-level package owns the primitive. | Keep when intentional and documented. Canonical ownership can still be internal; convenience import paths are not inherently harmful duplication. | **No change recommended.** Removing re-exports is source-breaking for little simplification gain. |
| U-09 | users-api `@MapPersistenceErrors({ unique: [] })` without `otherwise` | None as library API; this is a repository-local decorator invocation that changes no behavior. | Remove immediately from the sample. | **No.** Semantic no-op only. |
| U-10 | users-api `CacheModule.forRoot` with no pipeline-cache behavior consumer | No evidence against the package. It only shows unused **sample wiring**; the standalone cache behavior/module remains a valid library capability for other applications. | Remove the unused users-api registration/export only. Keep `@nestjs-pipeline/cache` unchanged. | **Potential users-api module API break** for consumers relying on that re-export; not a package capability break. |
| U-11 | exported addon observation/item symbols such as cache hit/key, rate-limit result/key, feature-flag decision, idempotency replay state, dead-letter state | **Useful integration surface** for custom logging, telemetry, audit, diagnostics, and behaviors. | Retain during S-10. A neutral observation bag may reduce the need to read each symbol directly, but it should not delete these extension hooks without a migration/deprecation plan. | **No change recommended during S-10.** Removing/renaming symbols is public API breaking. |
| U-12 | provider/store/transport interfaces and bundled adapters/sinks/stores | **Core library extensibility.** These are how consumers bring their own Redis/Postgres/broker/auth provider while keeping behavior semantics. | Keep public and stable. Simplification should make the default path easier, not close adapter seams. | **No change recommended.** Removing them would be a major capability/API break. |

---

### Table 7 — Things that look complex but should **not** be simplified away

| ID | Area | Why the complexity is currently justified | Safe simplification boundary |
|---|---|---|---|
| K-01 | CASL type-level precheck + loaded-entity authorization | A behavior running before the handler cannot safely evaluate rules that depend on persisted entity state. Removing the second `authorizer.authorize(...loadedEntity...)` would weaken authorization. | Improve syntax/types and add guardrails, but keep the loaded-entity check explicit after authoritative load. Do not move user authorization into infrastructure repositories merely to hide the call. |
| K-02 | `PipelineBootstrapService` discovery/prototype/scoped-handler logic | Nest CQRS 11 does not expose a public handler middleware/interceptor that covers commands, queries and events with equivalent request-scoped behavior resolution. Replacing this with a custom bus fork would likely be more code and more coupling. | Hide the service from public API, reduce surrounding configuration, and keep its private-Nest dependency mechanically guarded. |
| K-03 | Resilience `handle(error)` and command/event `retry.replaySafe:true` requirements | They force the caller to acknowledge failure classification and replay safety. Removing them makes whole-handler retries easier but less correct. | Typed intent helpers/presets may reduce syntax, but the safety decision must remain explicit. |
| K-04 | D-01 event durability gap | Moving current in-memory publication to a behavior removes handler boilerplate but does not make it transactional. | Preserve current semantics until the owner separately decides whether an outbox is required. |
| K-05 | D-03 direct MikroORM accessor mapping | Public hydration setters are a known trade-off that keeps the sample smaller. Removing them alone requires a persistence-record architecture. | Do not bundle that redesign into these simplifications. |
| K-06 | Separate addon modules/stores/transports | Audit, dead-letter, idempotency, rate-limit, flags and cache have legitimately different backend contracts. A generic "behavior module factory" would save internal lines but make types/docs/debugging worse. | Normalize conventions, names and typed intent helpers; keep explicit modules. |
| K-07 | Business identity for authorization/cache/rate-limit/idempotency | The framework can safely own escaping, partition mechanics and missing-context failure, but it cannot infer whether a quota is per user vs account, or whether two requests represent the same business operation. Automatic inference would make the API shorter by hiding a security/domain decision. | Typed tokens, module-level shared resolvers and package key builders should make the decision easy to state once. Do not infer principal/business identity from arbitrary request fields or hash the whole command as a universal idempotency default. |

---

### Target developer experience

The normal application developer should be able to understand a handler without reading any behavior implementation.

#### Application layer

Current style remains supported:

```ts
@UsePipeline(
  [CaslBehavior, { rules: [{ action: 'create', subject: 'User' }] }],
  [FeatureFlagBehavior, { flag: 'user-registration' }],
  [RateLimitBehavior, { keyFactory: createUserRateLimitKey }],
  [IdempotencyBehavior, { keyFactory: createUserIdempotencyKey }],
)
```

Preferred typed-intent style:

```ts
@UsePipeline(
  authorize({ action: 'create', subject: 'User' }),
  featureFlag('user-registration'),
  rateLimit({ key: perEmail }),
  idempotent({ key: createUserKey }),
)
```

The helper names are less important than the contract: they are tiny typed builders returning the existing runtime entry shape. There is still one pipeline decorator and one visible execution order.

For the global-except-special-case pattern:

```ts
@CommandHandler(InternalRebuildCommand)
@SkipPipeline(AuditBehavior)
export class InternalRebuildHandler implements ICommandHandler<InternalRebuildCommand> {
  // ...
}
```

No behavior-specific fake option such as `captureKinds: []`, no module-scope restructuring, and no duplicate behavior class.

#### Domain layer

Keep `@Mutate()` because it already expresses the right invariant: version/timestamp mutation lifecycle belongs to the aggregate, not to every caller.

Small simplification:

```ts
export class User extends RootEntity<UserSnapshot> {
  @Mutate()
  update(...) {
    // domain mutation + explicit event recording
  }

  // no empty afterUpdate() required
}
```

Do **not** automatically invent generic domain events inside `@Mutate()` as the default. Explicit event classes carry domain meaning and handler identity. An optional event factory could be added later, but it is lower value than removing the empty hook.

#### Repository layer

Preferred normal write:

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
  // only the actual database operation remains here
}
```

The decorator owns the already-existing lifecycle:

1. run persistence/error translation;
2. acknowledge the successfully persisted version;
3. perform best-effort cache maintenance after durable success.

For an advanced repository, the individual decorators remain available.

---

### Security-specific simplification

Simplification is valuable only if it removes security decisions from repetitive call sites without hiding the decisions that are inherently domain-specific.

#### Authorization

What can be simplified:

- typed `authorize(...)` pipeline intent instead of raw `Record<string,unknown>`;
- global principal/context resolution;
- optional helper APIs that make field lists typed against known mutable fields.

What must stay explicit:

- authoritative entity load;
- instance-level `authorizer.authorize(action, loadedEntity, fields)`;
- application choice of which fields are being changed.

A "magic repository authorization decorator" is **not** recommended. Authorization is an application policy and depends on actor + loaded domain state; pushing it into persistence would violate the repository boundary and make bypasses harder to audit.

#### Cache / rate-limit / idempotency keys

The framework should own segment escaping, tenant partitioning and missing-context failure.

The application should own only the business discriminator:

- cache: which request/result dimensions can change the authorized response;
- rate limit: who/what shares a quota;
- idempotency: what business operation a key represents.

This leads to a consistent rule:

> Call-site code selects identity; package helpers construct the safe key.

---

### Implementation order

The order below maximizes value while keeping each step independently reviewable.

1. **S-01 `@SkipPipeline`** with unit/integration coverage.
2. **S-02 typed intent entry builders** with required handler-intent fields; keep raw tuples.
3. **S-15 bootstrap diagnostics/behavior contracts** so deterministic policy mistakes fail before traffic.
4. **S-16 typed pipeline items** so cross-behavior data stops relying on magic strings/casts.
5. **S-09 immediate users-api cleanup**: global Logging defaults + `loggerProvider`.
6. **S-08 remove unused users-api pipeline CacheModule wiring** only from the sample.
7. **S-05 + S-06**: default no-op `afterUpdate`, add `optimisticDelete`.
8. **S-03 `@PersistedWrite`** and migrate users-api repositories; retain low-level decorators.
9. **S-07 secure idempotency/rate-limit key builders** and migrate manual sample factories.
10. **S-13 metadata composition** when required for safe decorator composition.
11. **S-17 reusable app-owned presets** on top of S-13.
12. **S-10 core observation bag / remove TelemetryBridgeBehavior**, retaining public observation hooks during migration.
13. **S-04 PublishDomainEventsBehavior** after proving exact event/failure semantics against current `CommandBaseHandler`.
14. **S-11 async static-global configuration** if duplicate provider/composition declarations remain annoying.
15. **S-12 query-cache hydrator defaults**.
16. **S-14/U-* narrow compatibility cleanup** only for true leakage/duplication, never from sample usage alone.

---

### Required tests for the simplification work

#### Pipeline opt-out

- global behavior runs by default;
- `@SkipPipeline(Behavior)` removes only that behavior;
- stable `PIPELINE_BEHAVIOR_ID` identities are honored;
- skipping one behavior preserves relative order of the rest;
- contradictory local add + skip fails clearly at bootstrap;
- works for singleton and request-scoped handlers;
- works for command/query/event scopes.

#### Typed intent helpers

- each helper produces exactly the current `PipelineBehaviorEntry` shape;
- TypeScript fixtures reject wrong option names/types;
- handler-intent builders reject missing activation fields such as cache/rate-limit/idempotency keys and feature-flag key;
- module-default option types may remain partial;
- raw `@UsePipeline([Behavior, options])` remains accepted.

#### Composite persistence decorator

- exact lifecycle order matches current canonical stack;
- persistence failure: no acknowledgment and no cache mutation;
- successful update: acknowledgment occurs before cache write;
- delete: barrier/eviction semantics unchanged;
- unique errors and residual transient mapping preserve identity/cause behavior;
- decorator supports custom entity selector for non-standard signatures;
- individual existing decorators still work independently.

#### Domain event publication behavior

- aggregate result publishes buffered events once;
- aggregate-bearing object result publishes once;
- non-aggregate result is ignored;
- handler error publishes nothing;
- EventBus publication failure preserves current post-persistence failure semantics;
- aggregate is uncommitted only according to the current successful publication contract;
- nested/scoped handlers preserve current correlation/tenant context;
- skipping publication is explicit.

#### Key helpers

- missing tenant/principal fails closed where required;
- separator-containing identities cannot collide;
- two tenants with the same principal/business key do not share state;
- idempotency request fingerprint behavior remains unchanged;
- current users-api key semantics remain equivalent after migration.

#### Telemetry observations

- addon package still installs/runs without OpenTelemetry SDK/package coupling;
- trace sees addon observations;
- metrics do not automatically ingest unbounded request-local attributes;
- absence of an addon remains absence, not fabricated `false`;
- observation failures cannot change business outcome.

#### Bootstrap diagnostics

- an explicitly configured cache/rate-limit/idempotency/feature-flag policy missing its activation field fails during bootstrap when the absence is deterministic;
- a passive global behavior intended only to receive handler overrides remains allowed;
- the error names handler, behavior, missing/invalid contract and remediation;
- hard built-in order violations fail clearly rather than being silently rearranged;
- custom behaviors without a validation contract remain supported.

#### Typed pipeline items

- typed token preserves the value type through get/set/require;
- two same-description tokens do not collide;
- `requirePipelineItem` fails with an actionable item name;
- built-in observation tokens retain runtime identity/compatibility;
- raw `context.items` access remains supported.

#### Pipeline presets

- preset expansion produces the same effective entries/order as the explicit `@UsePipeline` form;
- presets compose with handler entries without metadata overwrite;
- bootstrap diagnostics see the expanded chain;
- handler overrides use the same deterministic merge rules;
- raw one-off `@UsePipeline` remains accepted.

---

### Expected result

After these changes, the sample should read like an application built **with** a framework rather than an application explaining the framework's implementation.

A normal developer should mainly need to know:

- `@UsePipeline(...typed intents...)`;
- `@SkipPipeline(...)` for the rare global exception;
- `@Mutate()` for domain mutations;
- `@PersistedWrite(...)` / `@FromCache(...)` at repository boundaries;
- explicit loaded-entity authorization where persisted state matters.

The implementation should continue to own:

- behavior resolution/order/deduplication;
- global/default option merging;
- context/correlation/tenant propagation;
- safe partition construction;
- cache mutation barriers/CAS;
- optimistic concurrency diagnostics;
- persistence lifecycle ordering;
- event publication lifecycle;
- observability plumbing;
- bootstrap-time diagnostics for deterministic policy mistakes;
- typed cross-behavior context access;
- reusable policy-preset composition without metadata overwrite.

That division gives the same current feature set with a smaller, safer application-facing surface.


## Final disposition

E-01 and E-02 are implemented. The owner approves a single automatic release script and CASL 7-only support; CASL 6 compatibility is outside the advertised peer contract.

D-01 through D-03 must remain untouched until the owner provides an explicit decision. In particular, do not introduce an outbox, split ddd-core, replace AggregateRoot, or remove hydration setters as a side effect of implementing E-01/E-02.

V-01 has fresh local execution evidence in docs/reviews/Verification.E01.E02.md. It applies to the identified working tree; no commit-level CI verification is claimed.

The simplification work S-01 through S-17 is an additional implementation track, not a correction of failed R-01 through R-08 work. It must preserve current capabilities and the D-01 through D-03 decision gates. The detailed simplification evidence is consolidated above. The executable implementation contract is `docs/reviews/LLM.Agent.Implementation.Brief.md`; that brief is subordinate to this review and must not reinterpret D-01 through D-03.

---

## Προτεινόμενη Σειρά Εκτέλεσης Εργασιών (Τύπου D & S)

Ο παρακάτω πίνακας αποτυπώνει την επικαιροποιημένη σειρά εκτέλεσης των αρχιτεκτονικών αποφάσεων (D-01 έως D-03) και των εργασιών απλοποίησης (S-01 έως S-17), κατόπιν της **πλήρους ολοκλήρωσης των αποφάσεων D-02 (Option C: Own the Aggregate Primitive) και D-03 (Direct Mapping with Biome Grit Guardrails)**.

Η αυτονόμηση του `AggregateRoot` στο domain layer και το κλείδωμα της ασφαλούς ενθυλάκωσης μέσω linters αναδιαμόρφωσαν θεμελιωδώς τις υπόλοιπες εργασίες:
1. **D-02 (Ολοκληρώθηκε):** Το domain είναι πλέον 100% αγνό TypeScript. Αποτράπηκε η διάσπαση του πακέτου και κλειδώθηκε η καθαρότητα των aggregates.
2. **D-03 (Ολοκληρώθηκε):** Κλειδώθηκε η διατήρηση του άμεσου mapping με πλήρη στατικό έλεγχο (Biome Grit plugin + `@internal`/`@deprecated`), αποτρέποντας δεκάδες άσκοπους mappers και ξεκλειδώνοντας άμεσα τα S-05, S-06 και S-03.
3. **S-04 (`PublishDomainEventsBehavior`):** Απλοποιήθηκε ριζικά. Το behavior λειτουργεί ως καθαρός αντάπτορας στο application layer: διαβάζει το αυτόνομο domain aggregate και διοχετεύει τα buffered events στο Nest `EventBus`, επιτρέποντας στους command handlers να απαλλαγούν από το `CommandBaseHandler` και την έγχυση του `EventBus`.
4. **D-01 (Transactional Outbox):** Αποσυνδέθηκε πλήρως από το Nest CQRS/EventPublisher. Τα uncommitted events είναι άμεσα προσβάσιμα στο persistence layer κατά το `save()`, επιτρέποντας την ατομική καταγραφή τους στον πίνακα `OutboxRecord` μέσα στο ίδιο DB transaction.
5. **S-14 (Καθαρισμός Δημόσιας Επιφάνειας):** Υλοποιήθηκε ήδη μερικώς, καθώς καταργήθηκε η διαρροή των re-exports του `@nestjs/cqrs` από το `ddd-core`.
6. **S-05 (`afterUpdate` hook):** Εφαρμόζεται άμεσα στο αυτόνομο `RootEntity` χωρίς καμία εξωτερική εξάρτηση.

| Α/Α | Κωδικός | Τύπος | Αντικείμενο & Περιγραφή | Γιατί σε αυτή τη σειρά (Αιτιολόγηση & Εξαρτήσεις) | Συνοπτικό «Πώς» (Τεχνική Υλοποίηση) |
|---|---|---|---|---|---|
| 1 | **D-02** | Αρχιτεκτονική Απόφαση (Ολοκληρώθηκε) | Ενσωμάτωση Αυτόνομου `AggregateRoot` στο Domain (Option C) | **Ολοκληρώθηκε πλήρως:** Ενσωματώθηκε το αυτόνομο `AggregateRoot` (NestJS 12 semantics) στο `ddd-core/domain`. Το domain layer έχει 0% εξαρτήσεις από `@nestjs/*` και `@mikro-orm/*`, ξεκλειδώνοντας και απλοποιώντας άμεσα τα S-04, D-01, S-05 και S-14. | Δημιουργήθηκαν τα `aggregate-root.ts`, `event.interface.ts`, `uuidv7.ts` στο `ddd/core/domain`. Ενημερώθηκαν τα `RootEntity`, EntitySchemas, `CommandBaseHandler` (duck-typing) και προστέθηκε μηχανικός έλεγχος απομόνωσης (`domain-entry-point.spec.ts`). |
| 2 | **D-03** | Αρχιτεκτονική Απόφαση (Ολοκληρώθηκε) | Αυστηρή Ενθυλάκωση Aggregates vs Άμεση Χαρτογράφηση MikroORM Accessors | **Ολοκληρώθηκε πλήρως:** Επιβεβαιώθηκε και κλειδώθηκε η διατήρηση του υφιστάμενου trade-off (άμεσο mapping με `accessor: true` για το MikroORM, αποτρέποντας mappers και διπλότυπα records). Η ενθυλάκωση προστατεύεται 100% μέσω του Biome Grit plugin (`aggregate-identity.grit`) και των `@internal`/`@deprecated` annotations στα setters. Ξεκλειδώνει άμεσα τα S-05, S-06 και S-03. | Προσθήκη JSDoc `@internal` & `@deprecated` σε όλα τα setters (`RootEntity`, `User`, `Role`), επέκταση του `aggregate-identity.grit` για απαγόρευση αναθέσεων εκτός persistence, και προσθήκη unit specs στο `biome-general-plugins.spec.ts`. |
| 3 | **S-01** | Απλοποίηση (P0 - Ολοκληρώθηκε) | Καθολικός μηχανισμός παράκαμψης συμπεριφοράς (`@SkipPipeline`) | **Ολοκληρώθηκε πλήρως:** Υλοποιήθηκε ο decorator `@SkipPipeline(...behaviors)` στο `@nestjs-pipeline/core`. Επιτρέπει σε handlers (command/query/event, singleton/scoped) να εξαιρούνται από global behaviors χωρίς hacky flags ή module splitting, με πλήρη έλεγχο αντιφάσεων (fail-fast at bootstrap). | Υλοποιήθηκε το σύμβολο `PIPELINE_SKIPPED_BEHAVIORS_METADATA` και ο decorator `SkipPipeline`. Το `PipelineBootstrapService` φιλτράρει τα skipped behaviors βάσει `BehaviorId` πριν το DI resolution και αποτυγχάνει με exception σε ταυτόχρονη δήλωση `@SkipPipeline` και `@UsePipeline`. Πλήρης κάλυψη με unit tests. |
| 4 | **S-02** | Απλοποίηση (P0) | Τυποποιημένοι Intent Entry Builders (`authorize`, `rateLimit`, κ.λπ.) | Βασική βελτίωση compile-time ασφάλειας. Σήμερα τα generic options tuples επιτρέπουν την παράλειψη κρίσιμων πεδίων (π.χ. keys, flags). Οι builders εξασφαλίζουν ότι ένας handler δηλώνει ρητά τα υποχρεωτικά πεδία ενεργοποίησης. | Πακέτα εξάγουν συναρτήσεις (`authorize()`, `rateLimit()`, `idempotent()`, `cache()`, `featureFlag()`) που παράγουν `PipelineBehaviorEntry` tuples με αυστηρούς τύπους (required activation fields για handlers, optional για module defaults). |
| 5 | **S-15** | Απλοποίηση (P0) | Διαγνωστικά Bootstrap & Behavior Validation Contracts | Συμπληρώνει άμεσα το S-02. Μεταφέρει τον εντοπισμό σφαλμάτων παραμετροποίησης (π.χ. ελλιπές key factory, λάθος σειρά behaviors) από το πρώτο runtime αίτημα στην εκκίνηση της εφαρμογής (fail-fast at bootstrap). | Προσθήκη προαιρετικού hook/contract επικύρωσης στα behaviors. Το core εξετάζει τα effective options κατά το bootstrap και ρίχνει σαφή exceptions με το όνομα του handler, το behavior και οδηγίες επίλυσης. |
| 6 | **S-16** | Απλοποίηση (P1) | Τυποποιημένα Tokens/Accessors για το Context (`IPipelineContext.items`) | Εξαλείφει magic strings, raw symbols και unchecked type casts (`as string`) κατά τη διακίνηση δεδομένων μεταξύ behaviors. Αποτελεί άμεσο προαπαιτούμενο για το καθαρό observation/telemetry bag (S-10). | Εισαγωγή `createPipelineItem<T>(desc)`, `getPipelineItem`, `setPipelineItem` και `requirePipelineItem` (με περιγραφικό σφάλμα). Τα ενσωματωμένα symbols αποκτούν type safety διατηρώντας backwards compatibility. |
| 7 | **S-08** | Απλοποίηση (P1) | Αφαίρεση περιττής δήλωσης `CacheModule` από το `users-api` | Άμεσος καθαρισμός (Quick Win). Το `users-api` αρχικοποιεί το `@nestjs-pipeline/cache` χωρίς να έχει ενεργό consumer (χρησιμοποιεί ανεξάρτητα το ddd-core cache), δημιουργώντας σύγχυση στους developers. | Αφαίρεση της κλήσης `CacheModule.forRoot(...)` και του export από το `ReliabilityModule` του sample, χωρίς καμία αλλαγή στο αυτόνομο πακέτο cache. |
| 8 | **S-09** | Απλοποίηση (P1) | Καθολικές προεπιλογές Logging και χρήση του `loggerProvider` | Αφαιρεί επαναλαμβανόμενο boilerplate logging (`requestResponseLogLevel: 'log'`) από δεκάδες handlers και χρησιμοποιεί την ειδική επιλογή `loggerProvider` αντί του generic `extraProviders`. | Ορισμός του `requestResponseLogLevel: 'log'` στο global `LoggingBehavior`. Στο `ObservabilityModule`, σύνδεση του `NativeLogger` μέσω `loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: NativeLogger }`. |
| 9 | **S-05** | Απλοποίηση (P1) | Προεπιλεγμένη No-op υλοποίηση του `RootEntity.afterUpdate()` | Άμεση και ασφαλής απλοποίηση domain, πλέον στο δικό μας αυτόνομο `RootEntity`. Αφαιρεί περιττό boilerplate από όλα τα aggregates (`User`, `Role`, `Auth`, `Capability`) που υποχρεώνονταν σε κενό override. | Μετατροπή της μεθόδου σε concrete `protected afterUpdate(): void {}` στο `RootEntity` και διαγραφή των κενών overrides από όλα τα aggregates του sample. |
| 10 | **S-06** | Απλοποίηση (P1) | Βοηθητική μέθοδος `optimisticDelete` στο `ddd-core` | Εξάλειψη διπλότυπου, κρίσιμου κώδικα ασφάλειας. Ο αλγόριθμος version-conditioned διαγραφής και διάγνωσης (`ConcurrencyConflictError` vs `EntityNotFoundException`) είναι σήμερα αντεγραμμένος στα delete repositories. | Δημιουργία της `optimisticDelete(em, Entity, aggregate, entityName)` στο persistence layer του `ddd-core` κατά το πρότυπο του υπάρχοντος `optimisticUpdate`. Μετάβαση των repositories χρήστη/ρόλου σε αυτή. |
| 11 | **S-07** | Απλοποίηση (P1) | Ασφαλείς Partitioned Key Factories (Rate-limit & Idempotency) | Αποτρέπει κρίσιμα σφάλματα διαρροής cross-tenant δεδομένων. Σήμερα το sample συνενώνει χειροκίνητα strings για κλειδιά, με κίνδυνο λαθών στο delimiter escaping ή στην απουσία ελέγχου tenant. | Υιοθέτηση του έτοιμου `createPartitionedRateLimitKeyFactory` στο sample και δημιουργία συμμετρικού `createPartitionedIdempotencyKeyFactory` με υποχρεωτικό fail-closed έλεγχο tenant/principal και αυτόματο escaping. |
| 12 | **S-03** | Απλοποίηση (P0) | Σύνθετος διακοσμητής εγγραφής `@PersistedWrite` | Εγγυάται τη σωστή σειρά του persistence lifecycle (`@Cache` → `@AcknowledgePersisted` → `@MapPersistenceErrors`) σε καθαρά domain aggregates και εξαλείφει την ανάγκη χειροκίνητης επανάληψης boilerplate στα repositories. | Δημιουργία composite method decorator που εφαρμόζει εσωτερικά τους 3 decorators στην κανονική σειρά, με προεπιλεγμένο entity extractor το 1ο όρισμα. Τα επιμέρους decorators παραμένουν διαθέσιμα ως escape hatches. |
| 13 | **S-13** | Απλοποίηση (P2) | Ασφαλής σύνθεση metadata διακοσμητών pipeline | Απαραίτητη τεχνική υποδομή για το S-17. Σήμερα πολλαπλοί `@UsePipeline` decorators κάνουν overwrite τα metadata αντί να τα συνθέτουν deterministically. | Κεντρικός μηχανισμός συγχώνευσης decorator metadata με διατήρηση σειράς (top-to-bottom) και deduplication βάσει `BehaviorId`. |
| 14 | **S-17** | Απλοποίηση (P1) | Επαναχρησιμοποιήσιμα Presets Πολιτικών (`createPipelinePreset`) | Βασίζεται στο S-13. Επιτρέπει στις εφαρμογές να ορίζουν επαναχρησιμοποιήσιμα πακέτα πολιτικών (π.χ. `AuditedWrite`), μειώνοντας δραστικά την επανάληψη διακοσμητών σε handlers. | Συνάρτηση `createPipelinePreset(...entries)` που παράγει custom decorators οι οποίοι επεκτείνονται σε κανονικά pipeline entries χωρίς νέο runtime engine. |
| 15 | **S-10** | Απλοποίηση (P1) | Core Observation Bag & Κατάργηση `TelemetryBridgeBehavior` | Εξαλείφει ~100 γραμμές bridge κώδικα στο sample. Βασίζεται στα typed tokens (S-16) για να επιτρέψει στα behaviors να εξάγουν παρατηρήσεις χωρίς άμεση εξάρτηση από το OpenTelemetry SDK. | Δημιουργία lightweight transport-neutral observation store στο `IPipelineContext`. Ενημέρωση των behaviors να γράφουν εκεί, αυτόματη ανάγνωση από το OTel TraceBehavior και διαγραφή του `TelemetryBridgeBehavior`. |
| 16 | **S-04** | Απλοποίηση (P1) | `PublishDomainEventsBehavior` στο Command Pipeline | **Ριζικά απλοποιημένο χάρη στο D-02:** Το behavior λειτουργεί πλέον ως καθαρός αντάπτορας μεταξύ του αυτόνομου `AggregateRoot` και του Nest `EventBus`. Απελευθερώνει πλήρως τους command handlers από την κληρονομικότητα του `CommandBaseHandler` και την έγχυση του `EventBus`, κάνοντάς τους καθαρά `ICommandHandler`. | Innermost global command behavior που εξετάζει τα αποτελέσματα για aggregates (ή duck-typed `getUncommittedEvents()`), δημοσιεύει τα buffered events στο Nest `EventBus` και καλεί `uncommit()`. Μετάβαση των command handlers του sample σε απλά `ICommandHandler`. |
| 17 | **S-11** | Απλοποίηση (P2) | Στατική δήλωση Global Behaviors στο `PipelineModule.forRootAsync` | Βελτίωση Developer Experience (DX). Εξαλείφει την ανάγκη διπλής δήλωσης providers (στατικά και στο runtime factory) στην ασύγχρονη αρχικοποίηση του module. | Προσθήκη προαιρετικού `globalBehaviors` array στο `PipelineModuleAsyncOptions`, επιτρέποντας στο Nest DI να καταχωρίσει τις κλάσεις πριν την κλήση του `useFactory`. |
| 18 | **S-12** | Απλοποίηση (P2) | Προεπιλογές Hydration σε επίπεδο `QueryRepository` | Αφαιρεί την επαναλαμβανόμενη δήλωση `hydrateFn` και `alwaysHydrate: true` σε κάθε μέθοδο ανάγνωσης. Διασφαλίζει ότι τα queries επιστρέφουν πάντα πλήρη, αυτόνομα domain aggregates αντί για raw snapshots. | Ορισμός προαιρετικού hydrator policy στον constructor του `QueryRepository`. Ο `@FromCache` υιοθετεί την προεπιλογή όταν δεν ορίζεται τοπικό override. |
| 19 | **S-14** | Απλοποίηση (P2) | Στοχευμένος καθαρισμός δημόσιας επιφάνειας (Leaked Internals) | **Μερικώς ολοκληρωμένο:** Η διαρροή του `@nestjs/cqrs` από το `ddd/core/index.ts` εξαλείφθηκε ήδη στο D-02. Απομένει η επισήμανση των εναπομεινάντων leaked internals (`PipelineBootstrapService`, διπλότυπα aliases correlation/tenant). | Επισήμανση με `@deprecated` των παρωχημένων aliases και αφαίρεση σε μελλοντική major έκδοση, διατηρώντας backwards compatibility στο ενδιάμεσο. |
| 20 | **D-01** | Αρχιτεκτονική Απόφαση & Υλοποίηση | Transactional Outbox / Ανθεκτική Παράδοση Domain Events | **Ριζικά καθαρότερη αρχιτεκτονική χάρη στο D-02:** Με τα events να συγκεντρώνονται στο δικό μας `AggregateRoot`, το Outbox δεν απαιτεί πλέον καμία σύζευξη με το Nest `EventPublisher`. Μπορεί να υλοποιηθεί 100% στο persistence layer (`save` / `@PersistedWrite`) μέσα στο ίδιο DB transaction. | Εάν ο Owner επιλέξει "ΝΑΙ": Σχεδιασμός πίνακα `OutboxRecord`, εξαγωγή των `aggregate.getUncommittedEvents()` και ατομική αποθήκευσή τους στο DB transaction μαζί με το aggregate, με ασύγχρονο relay worker. Εάν επιλέξει "ΟΧΙ": Διατήρηση του in-memory EventBus (μέσω S-04) και τεκμηρίωση του crash-window trade-off. |


