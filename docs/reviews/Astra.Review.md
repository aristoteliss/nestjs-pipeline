# Astra: consolidated repository review

> Historical review: findings and proposed snippets describe the snapshot listed
> below, not the current API. Use canonical package READMEs and source for usage;
> current dispositions are tracked in [Telikos.Pinakas.md](Telikos.Pinakas.md).
> Documentation drift is tracked under row 35.

**Verified checkout:** `6728f2c547d57cc0cd12241c76e89c4ae2743e84`  
**Review date:** 2026-09-13  
**Inputs:** [review instructions](Intstractions.md), [ChatGPT review](ChatGPT.Review.md), [Gemini review](Gemini.Review.md), current source, documentation, and tests.

## 1. Final assessment

**Keep the pipeline architecture. Finish the aggregate persistence and cache contracts, then tighten error and lifecycle APIs.** A framework-neutral pipeline engine, a new generic repository framework, and an automatic outbox are not the next useful changes.

ChatGPT provides the better overall architectural direction: preserve the Nest/CQRS integration and concentrate on concrete application boundaries. However, much of its highest-priority backlog has already been implemented. Gemini contributes useful remaining findings, especially unchecked deletes and cache adapter inconsistency, but several explanations, severity assignments, and proposed code snippets are inaccurate.

The current application is materially better than the application described by ChatGPT. Login now uses ports, revocation lookup is required, event handlers dispatch through application interfaces, principal type is explicit, and delete retry classification belongs to infrastructure. These should be recorded as completed work, not scheduled again.

The remaining substantive problems cluster around three contracts:

1. **Persistence lifecycle:** deletes do not check the state that was authorized, and updates do not acknowledge a successful persisted version on the same aggregate instance.
2. **Representation:** repository caches mix aggregates and snapshots, while adapters offer different object-ownership semantics.
3. **Execution lifecycle:** authorization exposes two error families, event publication depends on a documented but weakly enforced return contract, and cached resilience policies capture invocation-specific names.

There is no evidence here that the project needs a rewrite or wholesale abstraction removal. Similar behavior classes are mostly a useful convention. The risky complexity lies in implicit contracts and duplicated representations, rather than the number of packages.

### Scope and confidence

This is a source-verified synthesis of both reviews, with cross-package checks around their claims. It is not a claim that every line, dependency version combination, database interleaving, or deployment topology has been independently exercised. Findings below distinguish observable implementation defects, contract risks, resolved items, and optional architectural improvements.

The repository [AGENTS.md](../../AGENTS.md) and [architecture skill](../../.agents/skills/nestjs-pipeline-architecture/SKILL.md) govern the assessment. In particular, direct ORM hydration, private Nest bootstrap integration, aggregate-return event publication, and non-durable EventBus delivery must be assessed against their documented intent.

The checkout advanced during the review from `24029e1` to `6728f2c`; that commit only added the three supplied review documents. The application source under review did not change in that transition.

## 2. Disposition of every numbered finding

### ChatGPT review

| Original | Current verdict | Evidence and final recommendation |
|---|---|---|
| F-01: login boundary collapse | Resolved in the inspected application path | `UserLoginService` injects `ILoginCodeVerifier`, `IAccessTokenIssuer`, and repository interfaces. It has no Fastify session handling, JOSE implementation, environment lookup, or nested QueryBus dispatch. Preserve this structure. |
| F-02: BullMQ in event handlers | Resolved for the cited handlers | `UserCreatedHandler` and `UserUpdatedHandler` use dispatcher ports and `ITenantContext`; BullMQ integration lives in job adapters. Processors are infrastructure adapters and may legitimately restore context there. |
| F-03: optional JWT revocation lookup | Resolved | `JwtAuthenticator` requires `QUERY_REPOSITORY.findAuth` and always checks it after token verification. Do not reintroduce optional DI here. |
| F-04: publication depends on return shape | Confirmed contract limitation; lower severity | `CommandBaseHandler.execute()` recognizes an aggregate or `{ aggregate }`. This is explicitly documented and current positive examples comply. See A-05. |
| F-05: persisted version not advanced | Confirmed | User and role update repositories return snapshots after successful writes without advancing `_persistedVersion`. See A-02. |
| F-06: invalid public aggregate construction | Partially resolved; remaining trade-off | `User`, `Role`, and `Auth` now have private constructors. Public accessors remain for documented ORM hydration. Do not repeat the assertion that ordinary TypeScript callers can call `new User()`. See section 5. |
| F-07: combined context repository and UUID heuristic | Resolved for the cited problem | `GetUserContextQueryRepository` is persistence-only. `CaslUserContextResolver` branches on explicit `principalType`, rejects unclassified principals, and handles services separately. |
| F-08: persistence retry classifier in handlers | Resolved | Delete handlers depend on `isTransientOperationError`; repositories translate infrastructure errors using `mapPersistenceError`. |
| F-09: mixed `ddd-core` boundary | Accepted sample-support trade-off | It is private and explicitly uses Nest aggregates and MikroORM helpers. Clarify the package's promise before extracting packages. See section 5. |
| F-10: Nest/CQRS compatibility | Partially addressed; validation gap remains | README now limits CQRS 10 to singleton handlers; scoped/transient handlers require CQRS 11+. Keep that narrower contract and test actual supported installations. See A-07. |
| F-11: stale architecture documents | Historical examples are not present | `docs/Architecture.md` and `docs/architecture-audit.el.md` are absent in this checkout. Do not file defects against absent files. Some current prose still overstates guarantees; see A-09. |
| F-12: OpenTelemetry readiness heuristic | Resolved for tracing | `TraceBehavior` now calls the public Trace API without provider-name/delegate introspection. Metrics startup diagnostics remain best-effort and do not gate execution. |
| F-13: insufficient architecture tests | Partially addressed | Boundary tests and targeted E2E files now exist. Remaining needs are lifecycle, adapter parity, and actual version compatibility, rather than another broad mock-heavy suite. See section 6. |

The secondary recommendation to remove nested QueryBus use from login is also complete. The positive assessments of correlation, OpenFeature, structural rate-limiter interfaces, and owner-aware idempotency remain reasonable architectural guidance; they are not blanket correctness certifications.

### Gemini review

| Original | Current verdict | Correction / final recommendation |
|---|---|---|
| 1: `ForbiddenException` in CASL | Confirmed; medium, not critical | This is an error-contract inconsistency, not a demonstrated authorization bypass. The existing neutral exception takes a details object, not Gemini's string argument. See A-04. |
| 2: unchecked deletes | Confirmed; high | Both cited repositories delete by ID without expected version or affected-row checks. See A-01. |
| 3: mutable identity setters | Confirmed documented compromise | Do not remove accessors without changing MikroORM mappings and verifying hydration. See section 5. |
| 4: live aggregate in events | Confirmed API hazard; reduced current impact | Production user event handlers read `event.payload`; existing tests deliberately verify that payload survives aggregate mutation. Never apply the suggested `Object.freeze(this._entityRef)`: that freezes the live aggregate. See A-06. |
| 5: memory-cache hydration | Confirmed ownership/type inconsistency; explanation partly wrong | Getters are readable by `User.fromJSON`, so a getter does not itself lose version. `MikroOrmCache` stores JSON in a database table, not Keyv/Redis. See A-03. |
| 6: Zod async/undefined behavior | Async limitation documented; shape discrepancy needs narrower treatment | The root README explicitly requires synchronous constructor schemas. Unchanged generated requests skip reparsing, so the stated automatic undefined-key insertion does not generally occur. See A-08. |
| 7: resilience captures first request name | Confirmed; low | Retry logs can name the first event type handled by a shared handler. The suggested Cockatiel invocation signature is not established by the repository implementation. See A-10. |
| 8: global diagnostic registry leak | Low-priority bounded-use concern | Only decorators with options populate it; repeated identical class names overwrite entries. Unlimited growth requires continually new names/options, not ordinary requests or warm starts alone. See A-11. |
| 9: `stableStringify` loses cause | Confirmed; low | Preserve the public message and attach the original cause. See A-12. |
| 10: missing durable outbox | Intentional limitation, not current defect | A post-save publisher cannot retroactively join a completed database transaction. An outbox requires an explicit transaction and delivery design. See section 5. |

Other corrections: domain code is not completely Nest-independent (`RootEntity` extends Nest `AggregateRoot`); aggregate-changing handlers do return live aggregates to satisfy publication semantics; and the verified **74 files / 354 tests belong to users-api**, not all twelve published packages.

## 3. Prioritized implementation blueprint

Severity describes practical impact, not architectural purity. “Mandatory” below means necessary to meet the stated contract, not permission to alter production source as part of this review.

### ~~A-01 — Delete must validate the version that was loaded and authorized~~

> **Resolved.** Verified at commit `ba0b57d`. Delete repositories condition on `{ id, version: getExpectedVersion() }` and inspect affected rows. See [Claude.Review.md](Claude.Review.md#6-status-of-the-earlier-reviews).

**High · Correctness / concurrency · `ddd/users-api` · Mandatory**

**Locations:** [DeleteUserCommandRepository.save](../../ddd/users-api/src/users/persistence/delete-user.command-repository.ts), [DeleteRoleCommandRepository.save](../../ddd/users-api/src/roles/persistence/delete-role.command-repository.ts), and their corresponding delete handlers/tests.

The handler loads authoritative state, authorizes that aggregate, records its deletion event, and saves it. The repository then calls `nativeDelete` using only ID and ignores the affected count. Another command can update the entity between authorization and deletion. The delete consequently acts on state it did not inspect. A second deletion can also affect zero rows yet still return successfully and allow buffered deletion events to publish.

**Target:** execute one conditional delete using `{ id, version: aggregate.getExpectedVersion() }`. Require one affected row for success. Use the pre-mutation expected version, not an incremented current version. On zero rows, follow the existing update convention: distinguish a now-missing entity from a still-present version conflict, mapping through the existing presentation filter. Any diagnostic follow-up read is only an observation after the failed conditional write; it is not a substitute for the atomic condition.

Keep ORM details inside repositories. No new application port is necessary. Deterministic concurrency conflicts must not be classified as transient retry signals.

**Migration/API:** repository signatures can remain unchanged. HTTP clients may newly receive 409 or 404 for races formerly reported as success; document this correction. Decide repeated-delete semantics explicitly rather than inheriting “success” from ignoring a row count.

**Tests:** race two independent persistence contexts: load v1, update to v2, attempt delete of v1, assert the v2 record survives and no deletion event publishes. Also test concurrent deletion, successful matching-version deletion, tenant isolation, and cache eviction only after a successful delete. Run the same behavioral contract for users and roles against real persistence.

**Risk/benefit:** preserve the intentional error mapping and retry behavior while preventing stale authorization decisions from silently deleting newer state.

### ~~A-02 — A successful update must acknowledge the persisted version~~

> **Resolved.** Verified at commit `ba0b57d`. `@AcknowledgePersisted` captures the version before the await and advances the baseline only on resolution. See [Claude.Review.md](Claude.Review.md#6-status-of-the-earlier-reviews).

**Medium · Aggregate lifecycle / correctness · `ddd-core`, `ddd/users-api` · Mandatory for reusable save semantics**

**Locations:** [RootEntity.getExpectedVersion](../../ddd/core/domain/models/root.entity.ts), [UpdateUserCommandRepository.save](../../ddd/users-api/src/users/persistence/update-user.command-repository.ts), [UpdateRoleCommandRepository.save](../../ddd/users-api/src/roles/persistence/update-role.command-repository.ts).

The version baseline is initialized during construction, but successful native updates do not advance it. A loaded v1 aggregate can mutate to v2 and save successfully. Mutating and saving that same instance again still compares the database with v1 and conflicts with its own previous write. Current single-save handlers limit the immediate exposure; this is not proof that every update currently fails.

**Target:** give persistence a narrow acknowledgment operation, such as `acknowledgePersisted(version)`, and invoke it after confirmed durable success. It changes the expected-version baseline without recording a domain event or incrementing the version again. Capture the version actually written. If an outer transaction can roll back, define acknowledgment at its commit boundary or discard the rolled-back aggregate; do not silently keep a success baseline after rollback.

**Migration/API:** additive lifecycle method in the private support package; no HTTP or schema change. Document that persistence owns acknowledgment and application mutations still use domain methods. Do not introduce a general Unit of Work solely for this fix.

**Tests:** load → mutate → save → mutate the same instance → save again; both writes succeed. Failed writes leave the baseline unchanged. Cover both user and role and retain concurrent-writer conflict tests. A cache-maintenance failure after a committed database write must not undo acknowledgment or encourage repeating the write.

**Risk/benefit:** an acknowledgment called too early could hide a conflict. Correct ownership makes aggregate reuse predictable without replacing the repository abstraction.

### ~~A-03 — Define a snapshot and ownership contract for repository caching~~

> **Resolved.** Verified at commit `ba0b57d`. `toCacheSnapshot`, `MemoryCache` JSON detachment on both `set` and `get`, and `alwaysHydrate` + `hydrateFn` enforcement. See [Claude.Review.md](Claude.Review.md#6-status-of-the-earlier-reviews).

**Medium · Representation / test fidelity · `ddd-core`, `ddd/users-api` · Strongly recommended**

**Locations:** [FromCache](../../ddd/core/persistence/decorators/FromCache.ts), [MemoryCache](../../ddd/users-api/src/persistence/cache/memory.cache.ts), [MikroOrmCache](../../ddd/users-api/src/persistence/cache/mikro-orm.cache.ts), [GetUserQueryRepository](../../ddd/users-api/src/users/persistence/get-user.query-repository.ts), [GetUserHandler](../../ddd/users-api/src/users/cqrs/queries/get-user.handler.ts).

`FromCache` stores the method's result unchanged. That result can be a `User`. `MemoryCache` retains and returns the same object reference, whereas `MikroOrmCache` serializes through JSON and returns a snapshot. Writes can also populate the same logical cache with snapshots. Consequently the apparent `ICache<User>` contract does not accurately describe all returned values.

For an in-memory miss, the cached aggregate is also the object returned to the caller. Mutation of that object changes cached state without a new `set`. For an unhydrated hit, callers may receive an aggregate, a snapshot with Dates, or JSON-shaped data depending on how the entry was populated. `User.from` protects the query handler's ability to accept both representations but returns existing instances as-is; it does not establish ownership isolation.

**Correction to Gemini:** reading `snapshot.version` invokes the getter on a `User`; it is not inherently lost. Its replacement cache also discards TTL, `isNewer`, the existing options object, and the `undefined` miss contract. Do not copy it.

**Target:** define the cached representation as a snapshot and distinguish it from the repository's hydrated result. Introduce a small explicit snapshot serializer/hydrator contract where needed, or constrain these repositories to snapshots and rehydrate at their boundary. Make the memory adapter detach values on both storage and retrieval under the same agreed serialization semantics as the persistent adapter. Preserve TTL and conditional-newer behavior.

Keep this change scoped to `ddd-core` repository caching; the separately published pipeline cache and idempotency packages have their own contracts. Do not conflate all three APIs into one generic cache system.

**Migration/API:** correct cache generic types and, if needed, decorator snapshot types. Audit all `FromCache` callers. Date values may become strings at the cache boundary; hydration must restore domain dates. No database migration is inherently required.

**Tests:** one adapter conformance suite for misses, expiration, stale-write protection, mutation after `set`, and mutation after `get`. Repository tests must compare miss, hit, and `hydrate` modes for ID, version, dates, and prototype. Keep authorization after materialization and exercise it for both cache implementations.

**Risk/benefit:** serialization can change intentionally supported values; specify the domain before enforcing it. The benefit is predictable cached state and tests that exercise production representation semantics.

### ~~A-04 — Make CASL denial errors transport-neutral consistently~~

> **Fixed 2026-09-18.** Verified at commit `ba0b57d`. Both `CaslBehavior` throw sites now raise `UnauthorizedActionException`, the same family `CaslAuthorizer` uses. See [Claude.Review.md](Claude.Review.md#113-f-01--casl-denials-are-transport-neutral).

**Medium · Public error API · `pipeline-casl` · Strongly recommended**

**Locations:** [CaslBehavior](../../packages/pipeline-casl/src/casl.behavior.ts), [UnauthorizedActionException](../../packages/pipeline-casl/src/exceptions/unauthorized-action.exception.ts), [UnauthorizedActionFilter](../../ddd/users-api/src/common/filters/unauthorized-action.filter.ts).

Request/type authorization throws Nest `ForbiddenException`, while entity authorization throws `UnauthorizedActionException`. Both enforce denial, but consumers must handle different exception families depending on where the denial occurs. Queue or non-HTTP consumers inherit an unnecessary HTTP dependency.

Use the existing neutral error with its real constructor shape:

```ts
throw new UnauthorizedActionException({
  action: failedRule.action,
  subject: subjectName,
  reason: 'Access denied by the configured ability rule.',
});
```

The example is a target shape, not a literal patch. Define meaningful details for missing context as well as failed rules, preserving existing `onFail`/configuration semantics. Do not invent misleading action names just to satisfy an error constructor.

**Migration/API:** this changes a published runtime error contract, including `instanceof`, Nest's default exception handling, and filters. Release it as an announced breaking change or provide a deliberate compatibility transition. Keep HTTP 403 in the presentation adapter and ensure it is registered in the example application.

**Tests:** both denial branches, configured failure callbacks, entity denials, and non-HTTP dispatch. Express and Fastify must still produce 403 with appropriate details. Authorization must remain fail-closed.

**Risk/benefit:** an unadapted HTTP consumer could emit 500 after the change. Planned migration produces one consistent authorization failure contract without redesigning CASL or standardizing every package's error hierarchy.

### A-05 — Strengthen the existing command publication contract

**Medium · API misuse prevention · `ddd-core` · Strongly recommended hardening**

**Location:** [CommandBaseHandler](../../ddd/core/application/command-base.handler.ts) and its tests; aggregate-changing command handlers and controller mappers.

The documented contract recognizes `AggregateRoot` or a result with `aggregate: AggregateRoot`. Returning a DTO instead can suppress automatic publication. A protected `commit()` escape hatch also permits an alternative lifecycle that the repository guidance discourages. Multiple changed aggregates have no explicit automatic result contract.

This is a real maintenance hazard, but the current positive examples follow the contract. The contract itself is an intentional design decision, not a proven current event-loss defect in those handlers.

**Target now:** retain aggregate-return semantics and controller-side response mapping; strengthen result types and architectural tests for aggregate-changing handlers. Deprecate manual commit as an application extension point if current usages permit it. Do not move publication into individual repositories: a command with multiple writes can still fail after an earlier save.

**Future trigger:** if a real multi-aggregate command appears, design one explicit result carrying changed aggregates and support the old shapes during migration. Required metadata should not be optional on a type whose purpose is to guarantee publication. Avoid a Unit of Work or new dispatcher until transaction requirements justify it.

**Tests/API risks:** verify exactly one local publication call after success, none after handler/persistence failure, and no event buffering on hydration. Keep the distinction between local dispatch and completed asynchronous event handling. Any expanded result API must preserve controllers and idempotency serialization.

### A-06 — Deprecate live event entities without freezing aggregates

**Low to medium · Domain event API · `ddd-core` · Recommended incremental cleanup**

**Location:** [RootDomainEvent](../../ddd/core/domain/events/root-domain.event.ts), domain event tests, and user event handler tests.

`payload` captures detached event-time state; `entity` exposes the mutable originating aggregate. Consumers can observe subsequent mutations or mutate the aggregate themselves. However, the inspected production user event handlers already read payload, and regression tests cover that correct behavior. Do not claim a demonstrated production race in those handlers.

Deprecate `entity`, require event consumers to use payload, and add immutable scalar event metadata only where consumers actually need it. Remove the reference in a deliberate API migration after checking all consumers. Never freeze the original entity, and never pass a frozen plain snapshot off as a fully functional aggregate type.

**Tests/migration:** preserve the existing event-time payload mutation test; add checks that production consumers do not read live entity state. Keep the originating aggregate mutable through its legitimate lifecycle. No database changes are needed. This reduces temporal coupling without event sourcing or a new event framework.

### A-07 — Validate the compatibility contract that is actually advertised

**Medium · Release confidence · `pipeline` · Strongly recommended before compatibility-sensitive releases**

**Locations:** [package metadata](../../packages/pipeline/package.json), [bootstrap](../../packages/pipeline/src/services/pipeline.bootstrap.service.ts), [scoped-context tests](../../packages/pipeline/src/services/pipeline.bootstrap.scoped-context.spec.ts), [README](../../packages/pipeline/README.md).

Peers accept Nest/CQRS 10 and 11, while development and root overrides install 11. The README now explicitly restricts CQRS 10 to singleton handlers. A mocked module without `AsyncContext` checks a branch but is not evidence that a real Nest 10 installation boots and dispatches correctly.

Add isolated fixture installations outside the root's forced dependency versions. Test CQRS 10 singleton dispatch and CQRS 11 singleton/scoped/transient behavior according to the documented support matrix. Include command/query/event discovery, nested dispatch, multiple applications in one process, and destroy/restoration behavior where supported.

**Migration/API:** none if the advertised combinations pass. Otherwise narrow peer/support claims deliberately. Do not require unsupported CQRS 10 scoped handlers to pass, as the older ChatGPT wording implied. Keep private integration contained; replacing it with a new framework-neutral engine would not eliminate adapter compatibility testing.

## 4. Smaller findings and precise corrections

### A-08 — Align Zod request-shape contracts where it matters

**Low · Ergonomics / contract consistency · `pipeline-zod` · Optional unless property-presence semantics are required**

The constructor in [create-zod-request.ts](../../packages/pipeline-zod/src/create-zod-request.ts) omits undefined values and accepts object-like parsed output broadly. [ZodValidationBehavior](../../packages/pipeline-zod/src/zod-validation.behavior.ts) assigns all parsed keys and rejects non-plain top-level output when it parses. Already-validated unchanged generated instances bypass that parsing path.

Thus Gemini's simple unchanged-command example does not demonstrate the alleged shape change. Relevant differences occur across manually attached schemas, generated requests that require revalidation, and unsupported top-level transforms. Keep the synchronous constructor restriction already documented in the root README; there is no static generated `parseAsync()` API to recommend today.

Specify one record-shaped request contract and one undefined-key policy for construction and revalidation. Reuse a small helper only for these genuinely shared operations. Add tests for absent versus explicit undefined properties, revalidation, prototype preservation, base properties, and top-level array/primitive transforms. A shape-policy change is externally observable; review it as an API change. Do not introspect private Zod internals to detect arbitrary asynchronous refinements.

### A-09 — Narrow documentation guarantees and keep review status current

**Low · Documentation / maintainability · root and `ddd-core` · Recommended**

[ddd-core README](../../ddd/core/README.md) describes immutable timestamps while public setters exist, and says event snapshots ensure asynchronous handlers never suffer subsequent-mutation races even though `event.entity` remains live. The precise guarantees are detached timestamp reads and immutable snapshot consumption, with a documented hydration escape hatch.

Update those claims and the `RootEntity` comment saying accessors preserve encapsulation. Describe `ddd-core` as Nest-oriented sample support, consistent with its private package metadata. Prefer canonical package documentation and short links over repeated full implementations in multiple READMEs. Historical reviews should retain their snapshot label and link to a current disposition table such as section 2.

No code or schema migration is required. Verify examples against current constructors, repository interfaces, cache options, and actual file paths. Documentation checks should validate useful examples rather than mandate exact prose.

### A-10 — Cached resilience policies retain the first request's name

**Low · Observability · `pipeline-resilience` · Recommended**

[ResilienceBehavior.resolvePolicy](../../packages/pipeline-resilience/src/resilience.behavior.ts) caches by handler type and supplies the first `requestName` to [buildRetry](../../packages/pipeline-resilience/src/helpers/policy-factory.ts). A handler for multiple event types can therefore log the wrong event name on later retries. The current retry message uses `debug`, not the `warn` call quoted by Gemini.

The smallest fix is to log only the stable handler identity in shared-policy callbacks. If per-invocation event names are required, resolve them through execution-local context with a verified API. Preserve per-handler circuit/bulkhead state; constructing a fresh policy per request would change resilience behavior. Never store the current invocation in one mutable shared field.

Test two event types sharing a handler, including overlapping executions and a retry. No application API or database migration is needed; logging consumers may need updated message expectations.

### A-11 — Remove the legacy options registry on a planned boundary

**Low · Legacy API / retention · `pipeline` · Optional**

[PIPELINE_OPTIONS_REGISTRY](../../packages/pipeline/src/decorators/pipeline.decorator.ts) retains option maps by class name for diagnostics and is already deprecated. It is not execution state. Distinct dynamically generated names can accumulate retained options; ordinary requests do not add entries.

Retain documented compatibility until removal is announced, then remove registry population and the export together or supply an explicit diagnostic API if a consumer requires it. Do not silently turn a public exported Map into a no-op or introduce an environment flag solely for this cleanup. Test reflection-driven execution and same-name handler behavior independently of the legacy diagnostic map.

### A-12 — Preserve canonical serialization failure causes

**Low · Debuggability · `pipeline` · Optional small fix**

[stableStringify](../../packages/pipeline/src/helpers/stableStringify.ts) catches useful serializer errors and replaces them with a generic TypeError. Preserve the existing public message and attach `{ cause: error }` so callers can distinguish invalid values and cycles without changing key serialization semantics.

Keep existing message assertions where they represent compatibility; add cause assertions for representative failures. Successful serialized output must remain byte-identical. Do not include request contents in the new public message.

## 5. Architecture improvements and decisions to retain

### Preserve the Nest pipeline and independent behavior packages

The actual product is Nest CQRS pipeline integration. Handler discovery, DI resolution, reflection, scopes, and bootstrap wrapping solve that integration problem. Generic orchestration has not been demonstrated as a second product requirement.

Keep `PipelineModule` global semantics, organizational `forFeature()` registration, and the documented placement of global guards before short-circuit behaviors. Preserve post-materialization entity authorization. Keep repository caches conceptually separate from final-response pipeline caches and idempotency replay.

Do not unify audit, rate limiting, caching, resilience, and dead-letter behaviors simply because they share an options/defaults shape. Their ordering, failure, state, and backend contracts differ. Continue using existing narrow interfaces such as sinks, stores, dispatcher ports, and the OpenFeature integration.

### Keep the application ports already introduced

The current dependency direction is appropriate:

```text
Controllers/guards/filters -> application handlers/services -> domain + ports
Infrastructure adapters  -> application ports
Composition modules      -> ports + adapters, to bind implementations
Nest pipeline integration -> wraps CQRS handler execution
```

This diagram describes source dependencies. At runtime, application calls through a port reach its concrete adapter. JWT configuration, queue options, and persistence tenant mechanics belong in those adapters. Nest decorators in a Nest reference application's handlers are an accepted convenience and do not require another transport abstraction.

### Treat direct ORM aggregate mapping as an explicit design choice

The [users-api README](../../ddd/users-api/README.md) explicitly reserves accessors for MikroORM hydration. Private constructors now prevent ordinary TypeScript application construction. The remaining issue is that public setters allow callers to bypass domain mutation/version/event methods; their normalization does not remove that escape hatch.

For this small sample, retain direct mapping and add enforcement that application code uses factories/domain methods. If the sample is intended to teach strict domain encapsulation or gains more complex aggregates, introduce small persistence records and explicit mappers:

```text
persistence/UserRecord --UserMapper.toDomain--> User.fromJSON(snapshot)
User.toJSON()         --UserMapper.toRecord--> persistence/UserRecord
```

Only then remove mapped setters from domain objects. Verify creation, hydration, relations, dates, optimistic writes, and schema discovery before expanding to roles/auth. This exchanges mapper duplication for a stricter domain API; it is worthwhile only when that stricter API is an actual goal. Avoid generic mapper hierarchies.

### Clarify `ddd-core` before splitting it

Its Nest AggregateRoot base, CommandBaseHandler, cache decorators, and MikroORM helpers are intentional sample infrastructure. The name does not make it technology-neutral. Prefer accurate documentation and internal dependency organization today.

If independent domain reuse becomes necessary, start with genuinely neutral errors, snapshots, and repository interfaces. A neutral aggregate event-buffer interface plus a Nest publication adapter is possible, but changes inheritance, event behavior, and lifecycle testing. Do not introduce four new packages or a replacement CQRS system without that reuse requirement.

### Outbox: separate product requirement, separate transaction design

Nest EventBus delivery remains in-memory and non-durable. Keep this limitation explicit. Moving BullMQ behind a port and using dead-letter behavior does not make database changes and event delivery atomic.

If durable delivery becomes mandatory, persist aggregate changes **and outbox rows in the same database transaction**, then have a relay publish committed rows with stable event IDs, retries, and idempotent consumers. Define tenant routing, payload evolution, ordering needs, duplicate handling, and retention. Do not have `CommandBaseHandler` write an outbox row after the repository has already committed and claim transactional safety.

This belongs at the transaction/persistence boundary with an application-facing contract and infrastructure relay. It requires an ADR, schema changes, rollback tests, and crash/restart tests. It should not be implemented as an automatic side effect of this review.

## 6. Test assessment and verification performed

The suite contains useful behavioral and boundary coverage, including event payload isolation, tenant separation, private API boundaries, login ports, write-side hydration, and CASL filtering. The existence of tests named `*.e2e-spec.ts` is not evidence that they ran in the unit command.

Verification in this review:

| Check | Result |
|---|---|
| `pnpm test:unit` | All 12 published-package test commands and `ddd-core` passed. `ddd/users-api` initially failed because the sandbox denied HTTP socket binding. |
| `pnpm --filter @nestjs-pipeline/ddd-users-api exec vitest run --reporter=verbose`, outside sandbox | **74 test files, 354 tests passed.** This resolved the environment-related failure. |
| Combined workspace result | All 14 workspace package test commands passed across the initial run and the users-api rerun. |
| `pnpm --filter @nestjs-pipeline/ddd-users-api typecheck` | Passed. |
| Dedicated PostgreSQL/Redis/Testcontainers E2E suite | Not run for this document-only review. No claim of live database race reproduction or E2E success is made. |
| Actual Nest/CQRS 10 installation | Not tested; compatibility validation remains a recommendation. |

Execution logs were captured in `/tmp/astra-review-unit.log` and `/tmp/astra-review-users-unrestricted.log`. They are local review artifacts, not repository deliverables. Source behavior, not test count alone, supports the open findings.

The most valuable additions are:

1. Real persistence races for update-versus-delete and repeat-delete behavior.
2. Repeated successful saves of the same aggregate, including failure/rollback semantics.
3. Shared cache adapter conformance and repository miss/hit/hydration tests.
4. Error-contract integration across CASL behavior, entity authorizer, and HTTP adapters.
5. Actual supported Nest-version fixtures.

Extend existing boundary checks rather than pretending none exist. File-list/string checks can miss newly added files or equivalent imports through aliases. Where the rule is stable, use a small import/dependency scan over relevant directories with explicit exceptions for allowed repository tokens, Nest decorators, and composition roots. Avoid a blanket ban on paths containing `persistence`: the repository intentionally permits its injection tokens.

## 7. Suggested delivery order

| Order | Deliverable | Completion criterion |
|---|---|---|
| 1 | Conditional user/role deletes | Stale authorized state cannot delete a newer record; zero-row behavior and events are tested. |
| 2 | Persistence acknowledgment | The same aggregate can save two successive mutations; failures cannot advance its baseline. |
| 3 | Repository cache representation contract | Memory and persistent adapters meet the same documented ownership/hydration semantics while preserving TTL and newer-write protection. |
| 4 | CASL error contract | One neutral denial family with a documented migration and retained HTTP 403 behavior. |
| 5 | Publication and event API hardening | Current aggregate-return semantics are enforced; production event consumers use snapshots. |
| 6 | Compatibility fixtures and accurate docs | Supported versions run in genuine isolated installations; guarantees match implementation. |
| 7 | Small maintenance fixes | Resilience log identity, serializer causes, and planned registry cleanup. |

Do not reopen completed auth/messaging refactors. Do not make persistence-record separation, framework-engine extraction, or an outbox prerequisites for these fixes. Revisit those options only with a concrete encapsulation, reuse, or durability requirement.

**Final recommendation:** accept ChatGPT's preservation-oriented architectural strategy, incorporate Gemini's verified delete/cache/error-contract observations with the corrections above, and execute the remaining work as small contract-focused changes. This will make the repository more predictable and harder to misuse while preserving its purpose as a Nest CQRS pipeline library and DDD example.
