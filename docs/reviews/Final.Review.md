# Final Repository Review — review/remaining-findings

**Review baseline:** review/remaining-findings @ 1d4807bbd6cd4e9e11db0f54f8c3a4ef662a91ba
**Review date:** 2026-09-20
**Scope:** the full production surface — `packages/*/src`, `ddd/core`, `ddd/users-api/src`, `biome/plugins`, `integration/packages` — plus `AGENTS.md`, `.agents/skills/nestjs-pipeline-architecture/SKILL.md`, and every package/application README.

This document is the single current review source of truth. `docs/reviews/LLM.Agent.Implementation.Brief.md` is the executable companion for implementation agents; it implements this review and does not redefine it or resolve decision-gated items.

## Current CASL package disposition and compatibility scope — 2026-09-22

**Current reviewed snapshot:** `9b7b17ac5d481bf2fab3619dfcb57d1640f6b6b8`. The original baseline and probes below remain historical evidence; this section governs the CASL package and release-compatibility follow-up. Detailed evidence: [CASL v2 commit review](CASL.v2.Commit.Review.md).

**CASL package verdict:** retain the architecture. `ICaslPermissionSource`, the two-stage check and `can` / void `authorize` / `project` fit the reusable library contract. No authorization bypass was reproduced inside the package. One reproduced library defect remains: root-array projection returns an object despite its array return type. The four authentication findings in the companion review belong to users-api, not to the CASL package; they are recorded separately and are outside this follow-up's implementation scope.

| ID | Priority / evidence | Current finding | Completion criterion |
| --- | --- | --- | --- |
| C2-01 | P2 / R | `packages/pipeline-casl/src/helpers/authorizer.ts:83–99` accepts root arrays; `helpers/projection.ts:132–145` returns an object. `Projected<T>` promises an array. | Align runtime root-array shape and public types, preserve masking and parent inheritance, add public-surface regressions and run packed-consumer verification. A record-only API restriction requires an explicit compatibility decision. |
| C2-02 | P2 / C | Supported public API differs from tagged baseline `3fc81b858dd4d7e139fb662307a5ffdef3a06675`; several affected packages retain patch-only version increments. | Document migration and agree release versions/peer ranges. No version bump, compatibility shim or publication is authorized by this documentation update. |

**Compatibility priority and scope:** core → correlation → OpenTelemetry → Zod → CASL. Exclude internal APIs, bootstrap internals and all other workspaces. In particular, `setCorrelationFallback` was marked `@internal` at the baseline and is not a supported-public-API break for this assessment.

| Package | Confirmed supported-surface change from the tagged baseline |
| --- | --- |
| Core | `originalCorrelationId` removed; `correlationId` read-only; logger-provider type narrowed to the logger token. |
| Correlation | `addCorrelationId()` rejects class instances/non-plain payloads; ordinary plain-object callers retain their API. |
| OpenTelemetry | No removed supported export or incompatible existing option identified; dependency requirements changed. |
| Zod | `ZOD_SCHEMA` removed in favor of `ZOD_SCHEMA_KEY`; successful parsed output is applied to the request; direct `ZodPipe.transform()` callers receive a Promise. |
| CASL | New permission-source module configuration; old providers/types removed; `buildAbility(rules, principal?)`; global deny-wins precedence; CASL 7 peer. |

All five packages require Nest 11. The core/correlation/OpenTelemetry/Zod changes predate the CASL v2 commit; the release comparison spans 88 commits. Local release tags were checked, not npm publication. See section 5 of the companion review for the version matrix and migration details.

**Verification evidence from this review session:** 165 CASL tests, 709 users-api tests, 33 targeted e2e tests, package/application typechecks, lint, and the packed release check passed. Five temporary probes reproduced the companion review findings; the probes were removed afterward. These are the earlier code-review runs, not tests rerun for this documentation synchronization, and do not establish old-consumer compatibility or a full-e2e pass.

**Documentation synchronization:** repository instructions and context workflow followed; manual map claims checked against source and generated sections refreshed. `pnpm context:validate` passed 58 checks (size warning only). No production code or package versions changed; runtime suites were not rerun for this documentation-only task.

The existing non-CASL backlog below is retained; it is not newly authorized work. Within the requested package follow-up, C2-01 is the concrete code repair and C2-02 is release preparation.

## Verification method and current branch assessment

Every row below states what was verified and how. Findings are labelled by evidence class:

- **R — reproduced defect:** an executable probe against the built modules of this checkout observed the wrong behaviour.
- **S — code-path inference:** the defect follows from reading the exact source path; no probe was run.
- **C — contract risk:** the implementation may be correct today, but a documented or implied guarantee is not enforced.
- **A — architectural proposal:** a design change, not a demonstrated defect.

Priorities: **P1** before production depends on the feature; **P2** significant maintainability/reliability work after correctness; **P3** cleanup and documentation. No P0 is assigned without an active incident or a universally exploitable gap.

Probes executed against `dist/` built from this branch (`ddd/users-api/dist`, `ddd/core/dist`, `packages/*/dist`, all built 2026-09-20), each cross-checked against the TypeScript source:

| Probe | Observed | Finding |
|---|---|---|
| aggregate mutation event version | aggregate `version: 2`, event `aggregateVersion: 1`, `payload.version: 1`, `payload.updatedAt` one tick behind | F-05 |
| `buildAuditRecord` with `metadataFactory` | record metadata is `{"tenantId":"t"}`; target and acting user absent; `actor` undefined | F-06 |
| `deepEqual` over Sets | `Set([{n:1},{n:1}])` equals `Set([{n:1},{n:2}])` → `true`; the reverse comparison → `false` | F-07 |
| `deepCloneAndFreeze` built-ins | `Object.isFrozen` true, yet `Date.prototype.setTime`, `Set.prototype.add` and `Map.prototype.set` all mutate the snapshot | F-11 |

Static verification closed several previously open items on this branch: `getBehaviorId` now returns the constructor reference (`packages/pipeline/src/decorators/pipeline.decorator.ts`); the correlation-scoped `defaultCacheKey` is gone and `CacheBehavior` fails bootstrap without an explicit key; the idempotency behaviour retains its claim and raises `IdempotencyCompletionError` when snapshotting or completion storage fails after a successful `next()`; the actor-first authorization overload was removed with an explicit migration error; `ddd/core/persistence/cache.interface.ts` now defines `IVersionedCache` (`readState`/`tryFill`/revision) and both shipped adapters implement it.

Pipeline-level caching now has a real production consumer — `ddd/users-api/src/users/cqrs/queries/get-user-overview.handler.ts` — which retires the "unused sample wiring" basis of S-08 / A-01 / U-10 and part of F-13, and simultaneously raises a new authorization finding (N-01).

`pnpm check` and `pnpm lint:persistence` pass on this tree (653 files, zero diagnostics). `ddd/core` unit tests pass (24 files, 310 tests). The full workspace suite, E2E and `pnpm test:release` were not executed for this review; see V-01.

## Table 1 — Executable findings and implementation status

| ID | Priority | Finding | Exact current location | Why it remains open | Required implementation / completion criterion |
|---|---|---|---|---|---|
| ~~E-01~~ | ~~P1 — release confidence~~ | ~~Automatic coverage of every published package.~~ | integration/packages/release.mjs; integration/packages/consumer; package.json test:release | **Done.** Discovery, packing, archive identity, strict install, TypeScript and runtime loading, core lifecycle and CASL 7 fixtures are in place. | Closed. Coverage limits stay documented in integration/packages/README.md. |
| ~~E-02~~ | ~~P1 — instruction consistency~~ | ~~Framework-neutral version-conflict contract.~~ | AGENTS.md rule 13; architecture skill, Optimistic updates and conditional deletes | **Done.** Both instructions use `ConcurrencyConflictError`, preserve `EntityNotFoundException`, and describe the HTTP 409 mapping. | Closed. |
| ~~F-01~~ | ~~P2 (was P1)~~ | ~~Repository cache coordination: atomic fill fencing, safe keys, explicit consistency.~~ | ddd/core/persistence/decorators/FromCache.ts; cache.interface.ts; ddd/core/README.md | **Done.** The residual is resolved by an explicit capability policy: `@FromCache` caches only through an adapter that satisfies `isVersionedCache`, and **bypasses an unversioned adapter for both reads and fills** — the query goes to the database. Bypassing fills alone was rejected because it would still serve entries written before a mutation; rejecting at configuration time was rejected because `ICache` is a published contract that `@Cache` write-through still supports. The racy get/set fill path is deleted rather than documented, and the bypass logs once per adapter instance so the loss of caching is observable. A stored `null` is now a miss on the versioned path, matching the removed path. The adapter-contract suite asserts no read, no fill, database on every call, the one-time warning, and full caching for a versioned adapter. Both bundled adapters are versioned, so no production path lost caching. | Closed. The dual-write window between a database commit and an unavailable cache remains, documented as best-effort; per-key CAS cannot remove it. |
| F-02 | — | Correlation ID is not a security boundary for the response cache. | packages/pipeline-cache/src/helpers/cache-key.ts; cache.behavior.ts:100-135 | **Done.** `defaultCacheKey` was removed. `CacheBehavior` declares a `PIPELINE_BEHAVIOR_CONTRACT` that fails bootstrap when an active cache declaration has no key, and `createPartitionedCacheKeyFactory` fails closed on missing tenant/principal. | Closed for the behaviour. The stale documentation left behind is tracked as N-02. |
| ~~F-03~~ | ~~P1~~ | ~~Idempotency: successful action, failed snapshot, second execution.~~ | packages/pipeline-idempotency/src/idempotency.behavior.ts:272-313 | **Done.** `release()` runs only when `next()` throws. Snapshot and completion-store failures keep the claim and raise `IdempotencyCompletionError` with a `snapshot`/`store` phase. | Closed. |
| ~~F-04~~ | ~~P1~~ | ~~Replay idempotency without binding to the permission scope.~~ | packages/pipeline-idempotency/src/idempotency.behavior.ts; interfaces/idempotency-record.interface.ts; stores/{memory,redis,postgres}.store.ts; ddd/users-api/src/common/cqrs/helpers/idempotent-operation.helper.ts | **Done.** The operation key stays stable and replay is bound separately. `replayScopeFactory` resolves a digest **before** the claim, so missing authorization context rejects the request without claiming a key; the digest is stored as `replayScope` and round-trips through all three stores (its own Postgres column, with an additive `ADD COLUMN IF NOT EXISTS`). A completed record replays only on an exact digest match: a mismatch, a record stored without a digest, or a caller with no resolvable scope raises `IdempotencyConflictError` reason `replay_scope` (`409`) without re-executing the handler, deleting the record or returning the response. Payload fingerprinting remains an independent `key_reuse` check. users-api derives the key from a trusted session principal — tenant, explicit `principalType` and id, versioned `v1:` namespace — and the `'anonymous'` fallback and payload `sessionUser` identity are gone. AGENTS.md rule 5 states when a stable key is permitted. | Closed. Scope equality speaks only for the captured context; an operation authorized on later-changing resource state still needs its own replay-authorization hook, which is documented rather than implemented. |
| ~~F-05~~ | ~~P1~~ | ~~Mutation events carry the pre-mutation version and timestamp.~~ | ddd/core/domain/decorators/ApplyMutation.ts; ddd/core/domain/decorators/Mutable.ts; ddd/core/domain/models/root.entity.ts; ddd/users-api/src/users/domain/models/user.entity.ts; roles/domain/models/role.entity.ts | **Done.** Coordinated mutation lifecycle and domain events via `@Mutable` backing fields and `@ApplyMutation({ event })` method decorator. Event factory executes after `onUpdate()` so event payload snapshots post-mutation version and timestamp. Pre-application checks (patch validation, field normalizers, callable lifecycle methods) abort before state changes; unexpected post-application failures propagate; public aggregate methods retain fluent `return this` signatures delegating to protected patch methods; Biome Grit rule `domain-mutation.grit` rejects direct `this.apply(...)` and legacy `@Mutate()` writes. | Closed. |
| ~~F-06~~ | ~~P1~~ | ~~Audit configuration that looks correct and is ignored.~~ | ddd/users-api/src/users/cqrs/commands/delete-user.handler.ts; roles/cqrs/commands/delete-role.handler.ts; ddd/users-api/src/common/audit/audit.options.ts | **Done.** Replaced raw tuples with `audit({...})` intent builder, renamed `metadataFactory` to `metadata`, registered trusted session actor factory as `AuditModule.forRoot` defaults (`AUDIT_MODULE_DEFAULTS`), added compile-time tests rejecting unknown options, and verified emitted records in `deletion-audit-records.spec.ts`. | Closed. |
| ~~F-07~~ | ~~P1~~ | ~~Hand-written deep equality returns the wrong answer for Sets.~~ | packages/pipeline-zod/src/helpers/zod-data.helpers.ts:133-146 | **Done.** Applied one-to-one consumption matching for Sets in `equalData`, ensuring symmetry, order independence, cycle safety, and correct multiplicity handling. Verified by regressions in `zod-data.helpers.spec.ts` and `zod-validation.regressions.spec.ts` (commit `dc6b1499`). | Closed. |
| ~~F-08~~ | ~~P1~~ | ~~Behavior identity derived from `class.name`.~~ | packages/pipeline/src/decorators/pipeline.decorator.ts:34-62 | **Done.** `BehaviorId` is `string \| Type<IPipelineBehavior>` and `getBehaviorId()` returns the constructor unless the class opts into a stable `PIPELINE_BEHAVIOR_ID` string. | Closed. Keep the two-same-name-constructors integration test as the regression. |
| ~~F-09~~ | ~~P1~~ | ~~Duplicated optimistic delete and an inconsistent autocommit contract.~~ | ddd/core/persistence/{assert-autocommit,optimistic-delete}.ts; ddd/users-api/src/{users,roles}/persistence/{create,delete}-*.command-repository.ts | **Done.** `optimisticDelete(em, entityType, aggregate, entityName)` is the single versioned delete: one conditional delete on `{ id, version: getExpectedVersion() }`, one affected row is success, zero runs one refreshed read to separate `EntityNotFoundException` from `ConcurrencyConflictError`, any other count is an invariant error. It takes the entity manager once and uses that instance for both statements. `assertAutocommit(em, operation)` is the one transaction-boundary check, shared by `optimisticUpdate`, `optimisticDelete` and both create repositories before flush/upsert; it runs before any statement, so a rejected write mutates nothing, leaves the persisted baseline unchanged and evicts nothing. Both delete repositories are migrated and are now identical apart from their cache keys. Unversioned Auth/session rows keep their own lifecycle rather than gaining a synthetic version column. | Closed. Also closes S-06. |
| ~~F-10~~ | — | ~~Authorization overloads that ignore the explicit actor.~~ | packages/pipeline-casl/src/helpers/authorizer.ts | **No longer applies.** CASL v2 deleted `entity-authorization.helper.ts`. `CaslAuthorizer` takes only the request ability and exposes `can`, a void `authorize` and `project`; there is no actor or `bypass` overload left to misuse. | Closed. |
| F-11 | P2 | Detachment is not runtime immutability. | ddd/core/domain/events/root-domain.event.ts:23-141 (`deepCloneAndFreeze`), :155-196 (`payload`, `aggregateVersion`) | **Open, reproduced (R).** The clone is `Object.isFrozen`, yet `Date.prototype.setTime.call(...)`, `Set.prototype.add.call(...)` and `Map.prototype.set.call(...)` all mutate the stored snapshot: `Object.freeze` does not protect built-in internal slots. The JSDoc promises "an immutable state payload snapshot". Detachment from the aggregate does work. | Keep deep detachment and the supported value types. Correct the documented guarantee: ordinary object properties are frozen, built-in internal slots are not, and method overrides are ordinary-call guards, not a security boundary. Offer an explicit copy-on-read accessor for consumers that need isolation from each other. Apply strict serialization at transport adapters instead of narrowing the in-memory contract. Coordinate with F-05 so the captured data carries the final version. |
| F-14 | P2 | Two near-identical EntityManager selection implementations. | ddd/users-api/src/persistence/mikro-orm.store.ts:72-170; postgres-mikro-orm.store.ts:42-140 | **Open (S).** Both stores implement their own `canReuseContextManager`, `em`, `sem` and `withFork`; within `postgres-mikro-orm.store.ts` the `em` and `sem` getters are themselves near-duplicates differing only in the cast. A security fix can reach one driver and miss the other. | Extract one internal resolver deciding whether a candidate context EntityManager belongs to the selected ORM/driver/tenant, and returning a safe fallback fork. Pass explicit inputs; do not read unrelated singletons. Keep driver-specific bootstrap, tenant initialization and shutdown in their stores. Add a shared table-driven suite over both adapters covering wrong schema, wrong ORM/config, wrong driver, absent context, concurrent tenants and active-transaction cases. |
| ~~F-16~~ | ~~P2~~ | ~~Dead-letter queue receives expected rejections.~~ | ddd/users-api/src/infrastructure/dead-letter.options.ts | **Closed.** `DEAD_LETTER_DEFAULTS` in the users-api composition layer lists the expected rejections by concrete class — validation, authentication/authorization, not-found, concurrency, unique-constraint, empty-update and value-object rejections, feature-disabled, rate-limit and idempotency conflicts, and the refresh-token rejections `InvalidRefreshTokenError` and `RefreshTokenReuseError` added with CASL v2 — and keeps `IdempotencyCompletionError` out of the replay queue as a post-success failure. `AuthConfigurationException`, `MissingTenantContextError` and unclassified errors are still captured. `ReliabilityModule` consumes the policy through the package's existing `ignoreErrors` hook; the reusable package is unchanged. `dead-letter.options.spec.ts` drives each class through a real `CommandBus` with the composed command-scope override: expected rejections and the completion error create zero records, unexpected failures create exactly one. | — |
| F-17 | P2 for incorrect security/API claims, otherwise P3 | Documentation drift and guards that promise more than they check. | packages/pipeline-cache/src/helpers/README.md; biome/plugins/{package-licenses,verify-package-licenses}.grit; resilience/feature-flags READMEs; root README test commands | **Open (S).** See N-02 for the concrete security-relevant instance found on this branch. The two Grit files named "licenses" check import/package boundaries, not licences. Package READMEs remain the right authority for their own options and defaults. | Make each package README authoritative for its own public API, options and defaults. State separately which command builds, which runs unit tests, and which needs Docker/database/Redis. Rename the licence-named Grit checks to describe import boundaries and update every reference. Keep a small set of typechecked examples for the most error-prone contracts (typed audit options, cache policy, idempotency replay scope, resilience command options). |
| ~~N-01~~ | ~~P1~~ | ~~A composed, cached read model returns user fields with no entity or field authorization.~~ | ddd/users-api/src/users/cqrs/queries/get-user-overview.handler.ts, user-overview-cache.policy.ts | **Done.** The composed candidate is authorized by a single `project('read', user, candidate)`, which performs the entity check and applies field and descendant masks together, so the response cannot be returned without it. Roles and additional capabilities require `read` on the `UserCapabilities` subject, evaluated against the target user's id, and fail closed for a principal granted only the profile. Roles are kept only when the loaded `Role` passes `read` and `read name`. The response cache is partitioned by tenant, principal type/ID from the CASL user context, rule digest and policy version, and bypassed for conditional `read` rules on `User`, `Role`, `UserCapabilities` or `all`. The read declares `refresh: true`, and `overview-repository-cache-freshness.spec.ts` drives the real `GetUserQueryRepository` with a real `MemoryCache` to prove a stale cached department cannot decide access: removing `refresh: true` fails that suite. | Closed. Response-cache freshness for conditional related resources rests on the bypass rather than on invalidation; that is the documented contract, not an open item. |
| ~~N-02~~ | ~~P2~~ | ~~Removed cache default still documented as the security contract; the documentation guard cannot see the file.~~ | packages/pipeline-cache/src/helpers/README.md; ddd/users-api/test/docs-cache-security.spec.ts | **Done.** Helpers README rewritten around required key and fail-closed partitioned key contract; doc guard extended to verify cache READMEs. | Closed. |
| ~~N-03~~ | ~~P1~~ | ~~Audit actor for login is taken from the caller-supplied request body, and now defeats the `authenticated` discriminator the rest of the audit trail carries.~~ | ddd/users-api/src/auths/cqrs/commands/create-auth.handler.ts; common/audit/audit.options.ts | **Done.** A pre-authentication command records a claim, not an identity: `claimedIdentityActor()` returns `{ authenticated: false, claimedEmail }`, so the record carries no `id` and cannot pass a filter for authenticated activity. The `'anonymous'` fallback is gone — an absent claim is expressed by the field being absent. `record.payload.email` still carries the attempted address, and `code` stays redacted. `login-audit-actor.spec.ts` asserts the emitted record through the real `CommandBus` with `AUDIT_MODULE_DEFAULTS`, covering the actor shape, the consumer filter and payload retention; `audit.options.spec.ts` covers the absent-claim branch, which command validation makes unreachable through the bus. | Closed. |
| ~~N-04~~ | ~~P3~~ | ~~Review and ticket identifiers in test suites.~~ | ddd/users-api/test/behavior-composition-contracts.spec.ts:4,73; test/docs-cache-security.spec.ts:8,14 | **Done.** Removed task/review identifiers from test titles and comments; zero ticket IDs remain in test titles across the workspace. | Closed. |
| ~~N-05~~ | ~~P3~~ | ~~Decorative divider banners in test files.~~ | packages/pipeline/src/services/pipeline.bootstrap.service.spec.ts; packages/pipeline-zod | **Done.** Removed in commit 12d912c8; zero divider lines remain in codebase. | Closed. |
| ~~N-06~~ | ~~P3~~ | ~~Silent `catch {}` inside the cache CAS path.~~ | ddd/users-api/src/persistence/cache/mikro-orm.cache.ts:253-257 | **Done.** Parse failure is logged via `logger.warn` with a SHA-256 key digest and no raw key or parse-error message; a factual comment explains that an unparsable entry is treated as absent to heal corrupted data. | Closed. |
| ~~N-07~~ | ~~P3~~ | ~~An audit `metadata` factory dereferences `context.request` unguarded, and a throw there drops the whole record rather than its metadata.~~ | ddd/users-api/src/users/cqrs/commands/delete-user.handler.ts:35; roles/cqrs/commands/delete-role.handler.ts:35 | **Done.** Safely guarded dereference `cmd?.id` ensures metadata errors cannot discard audit records. | Closed. |

## Table 2 — Open architecture/product decisions; implementation must wait for an explicit human choice

| Decision ID | Decision required | Exact current location | Current deliberate contract and trade-off | Decision packet / what must be chosen before code changes |
|---|---|---|---|---|
| D-01 | Whether durable domain-event delivery / a transactional outbox is a product requirement. | ddd/core/application/command-base.handler.ts:105-130 documents non-atomic in-memory EventBus delivery and publishes buffered events after handler success. AGENTS.md rule 10 says not to assume an outbox. | Database persistence and Nest EventBus publication are not atomic. A process failure after commit can lose an event. This is documented and is not repairable by a local retry wrapper or by writing an outbox after the repository has committed. | Decide whether the system needs durable at-least-once delivery, which commands/events require it, whether the aggregate write and the outbox row must share one database transaction, target relay/broker semantics, tenant routing, ordering requirements, stable event IDs, duplicate handling, retention and operational ownership. Until then, preserve the current honest in-memory semantics and do not add a placeholder outbox abstraction. |
| ~~D-02~~ | ~~Whether ddd-core should stay Nest-oriented or extract framework-neutral primitives.~~ | ddd/core/domain/models/aggregate-root.ts; domain/events/event.interface.ts; domain/models/root.entity.ts; domain/domain-entry-point.spec.ts | **Resolved via Option C — own the aggregate primitive.** `AggregateRoot` with NestJS 12 semantics is vendored into `ddd-core/domain`. The domain entry point loads no `@nestjs/*` and no `@mikro-orm/*`; the application layer keeps its Nest CQRS integration. | Closed. Do not reopen as a package split. The mechanical isolation check in `domain-entry-point.spec.ts` is the regression. |
| ~~D-03~~ | ~~Strict aggregate encapsulation vs direct MikroORM accessor mapping.~~ | ddd/core/domain/models/root.entity.ts; ddd/users-api/src/{users,roles}/domain/models/*.entity.ts; biome/plugins/aggregate-identity.grit | **Resolved via static guardrails.** Direct `accessor: true` mapping is retained; hydration setters carry `@internal`/`@deprecated`; `aggregate-identity.grit` rejects dot and literal-bracket writes, compound assignments and updates on receivers named `user`, `role`, `aggregate` or `entity` in application layers. | Closed. The guard is syntax- and naming-based: it cannot resolve types, aliases, dynamic keys, destructuring or reflection, so domain-method mutation stays a review requirement outside its coverage. |
| D-04 | Which command handlers must emit an audit record. | ddd/users-api/src/**/commands/ — audited: `DeleteUserHandler`, `DeleteRoleHandler`, `CreateAuthHandler`, `RefreshAuthHandler`; not audited: `CreateUserHandler`, `UpdateUserHandler`, `CreateRoleHandler`, `UpdateRoleHandler`, `DeleteAuthHandler` | Audit covers 4 of 9 command handlers (CASL v2 added the audited `RefreshAuthHandler`), so `AUDIT_MODULE_DEFAULTS` — including the trusted session actor — never reaches the other five. Creation and update of users and roles currently leave no audit trail. This is pre-existing and was never claimed otherwise; it is a coverage scope, not a defect. | Decide which mutations require an audit trail and why: regulatory obligation, incident reconstruction, or neither. Then choose per handler, with severity and payload redaction, rather than auditing everything by default. Deleting is not automatically the only sensitive operation — a role capability change is an authorization change. |

## Table 3 — Historical/current claims that cannot be independently confirmed from repository source state

| Verification ID | Claim / unresolved evidence question | Source locations that define the gate | What was verified from code | What is not independently verified and what evidence would close it |
|---|---|---|---|---|
| V-01 | Full verification execution evidence. | package.json verify:all | `pnpm check` and `pnpm lint:persistence` pass on this tree (653 files, zero diagnostics). `ddd/core` unit tests pass: 24 files, 310 tests. | This review did not run `pnpm test:unit` across all workspaces, `pnpm test:build`, `pnpm test:release`, or the Docker/PostgreSQL/Redis-backed E2E suites. No CI configuration exists in the repository, so no commit-level status can be cited. A complete `pnpm verify:all` run recorded against this commit would close it. |
| V-02 | Whether any third-party `ICache` adapter implements only `get`/`set`. | ddd/core/persistence/cache.interface.ts:124-136; decorators/FromCache.ts:200-283 | Both in-repository adapters (`MemoryCache`, `MikroOrmCache`) implement the versioned contract, so the legacy path is unreachable from this repository. | Published packages have consumers outside this checkout; a local search cannot establish that no external adapter uses the unversioned shape. Deciding F-01's residual item does not require that evidence — it requires choosing the behaviour for an unversioned adapter. |

---

## Detailed simplification review — S-01 through S-18

**Implementation companion:** `docs/reviews/LLM.Agent.Implementation.Brief.md`

`ddd/users-api` is an **ergonomics specimen**: it shows what a normal application currently has to write and remember. Absence of an in-repository consumer is **not** evidence that a public library API is useless. Public-surface decisions below rest on whether an API is a coherent reusable capability or extension point for external consumers, not on sample usage counts.

Nest CQRS 11 exposes configurable publishers and request-scoped handler support, but no public cross-command/query/event handler middleware API equivalent to this repository's behavior pipeline. The private `ExplorerService`/prototype integration therefore remains a managed implementation cost, not an obvious simplification target.

### Design rules for simplification

Every proposal must satisfy all of these:

1. **No feature reduction.** Low-level behavior/decorator APIs remain available as escape hatches unless an item is explicitly identified as dead or compatibility-only.
2. **Intent over mechanics.** Application code states "authorize", "audit", "cache", "idempotent", "persist" rather than reproducing framework ordering or key construction.
3. **Safe by default.** Security-sensitive defaults fail closed; simplification must not create shared cache/rate-limit/idempotency namespaces.
4. **One obvious happy path.** Advanced forms may remain, but normal application code should not have several equivalent ways to wire one feature.
5. **Per-handler override must be first class.** A global behavior must be overridable and, on explicit request, removable for one handler without composition tricks.
6. **Do not hide domain decisions.** Loaded-entity authorization, transaction/outbox semantics and actual persistence operations stay explicit where hiding them would weaken correctness.
7. **Preserve framework escape hatches.** Raw `@UsePipeline`, individual persistence decorators, custom policies/stores/providers and custom behaviors remain available.
8. **The sample is not the public-API oracle.** Remove public surface only when it is compatibility-only, implementation leakage, duplicated with no ergonomic value, or actively increases misuse risk.

---

### Table 4 — Highest-value simplifications

| ID | Priority | Current evidence | Current cost / misuse risk | Simpler target with same or better capability | Escape hatch / preserved behavior | Breaking change / migration impact |
|---|---|---|---|---|---|---|
| ~~S-01~~ | ~~P0~~ | packages/pipeline/src/decorators/pipeline.decorator.ts:13 (`PIPELINE_SKIPPED_BEHAVIORS_METADATA`); services/pipeline.bootstrap.service.ts | **Done.** `@SkipPipeline(...behaviors)` removes matching global behaviors by `BehaviorId` before DI resolution, preserves the relative order of the rest, covers command/query/event and singleton/scoped handlers, and fails at bootstrap on a contradictory skip plus local re-add. | — | Raw global scopes and handler-level `@UsePipeline` unchanged. | Shipped as additive. |
| ~~S-02~~ | ~~P0~~ | `audit()`, `rateLimit()`, `cache()`, `requires()` (was `authorize()`), `idempotent()`, `featureFlag()`, `resilience()` in the seven `packages/*/src/helpers/*.intent.ts` files | **Done.** Typed intent builders return the existing `PipelineBehaviorEntry` tuple and require activation fields at compile time; module defaults may stay partial. | — | Raw `[Behavior, options]` tuples remain supported. CASL v2 uses `requires(...rules)`, where each requirement is `{ action, subject, field? }`. | Shipped as additive. |
| S-03 | P0 | users-api write repositories stack `@Cache` → `@AcknowledgePersisted` → `@MapPersistenceErrors`; no composite decorator exists (`PersistedWrite` appears in no source file). | A normal repository write requires remembering decorator order and repeating `entity: ([entity]) => entity`. The API lets callers express the lifecycle incorrectly. | Add `@PersistedWrite({...})` applying the canonical lifecycle in the only correct order, defaulting the entity selector to the first argument, exposing cache policy, unique mappings, optional residual mapping, acknowledgment and barrier/CAS settings. | Keep `@Cache`, `@AcknowledgePersisted` and `@MapPersistenceErrors` exported for unusual signatures and caller-owned ordering. | **No — additive if the low-level decorators remain.** Removing them later is a separate public API break. |
| S-04 | P1 | `CommandBaseHandler` is referenced by 11 production files; handlers inject `EventBus`, call `super(eventBus)` and return an aggregate-bearing result only so the base class can publish. | Cross-cutting post-success publication creates inheritance and constructor boilerplate in every command handler and couples handler shape to one lifecycle implementation. | Move the publication logic into a `PublishDomainEventsBehavior` registered once at the innermost global command position. Handlers become ordinary `ICommandHandler` classes returning the same result. | Preserve the exact in-memory EventBus semantics and crash window. `@SkipPipeline(PublishDomainEventsBehavior)` is the escape hatch. Does **not** decide D-01. | **Potential source/API break.** Add the behavior and migrate first; removing `CommandBaseHandler` belongs to an intentional breaking release. |
| S-05 | P1 | `ddd/core/domain/models/root.entity.ts:311` still declares `abstract afterUpdate(): void`; `user.entity.ts:183`, `role.entity.ts:115` and the Auth/Capability aggregates carry empty implementations. | Every aggregate must implement an empty hook even with no post-mutation work. | Give `RootEntity.afterUpdate(): void {}` a default no-op and keep it `protected`/overridable. | Aggregates with real lifecycle work override it exactly as today. | **No.** Abstract hook to concrete no-op is source-compatible. |
| ~~S-06~~ | ~~P1~~ | **Done with F-09.** `optimisticDelete` lives beside `optimisticUpdate` in `ddd-core/persistence` and both delete repositories use it, so the concurrency algorithm exists once. | — | — | Callers can still issue custom deletes for non-versioned or special cases. | Shipped additively; delete and conflict semantics are unchanged. |
| ~~S-07~~ | ~~P1~~ | **Done.** users-api builds no security key by hand. The two rate-limit factories use `createPartitionedRateLimitKeyFactory`, and the package gains the symmetric `createPartitionedIdempotencyKeyFactory`: explicit tenant, principal and operation identity, segments escaped through core `joinKeySegments`, and `MissingIdempotencyPartitionError` on a missing tenant or principal with no shared fallback. The `'anonymous'` fallback is gone. | — | — | Arbitrary `keyFactory` remains available for unusual key semantics. | Idempotency keys keep F-04's `v1` layout and escaping alters only colliding segments, so ordinary claims keep matching. Rate-limit keys append the request name: a one-time in-memory limiter reset, accepted. |
| ~~S-08~~ | ~~P1~~ | ddd/users-api/src/users/cqrs/queries/get-user-overview.handler.ts:51-66 | **No longer applies.** The premise was that users-api registered `CacheModule` with zero `CacheBehavior` consumers. `GetUserOverviewHandler` is now a real production consumer using `CacheBehavior` with a partitioned key, so the registration is live wiring, not dead configuration. | — | `@nestjs-pipeline/cache` unchanged. | Superseded. The handler's missing entity authorization is tracked as N-01. |
| S-09 | P1 | `requestResponseLogLevel:'log'` is repeated in 10 production declarations; `ObservabilityModule` still binds `LOGGING_BEHAVIOR_LOGGER` through `extraProviders` (observability.module.ts:96) despite the dedicated `loggerProvider` option. | Repeated policy defaults obscure the few handlers that actually differ. A generic escape hatch is used for a first-class option. | Put `[LoggingBehavior,{requestResponseLogLevel:'log'}]` in the global behavior configuration; handler declarations then carry only real deltas such as `mapLogLevel`. Bind `NativeLogger` through `loggerProvider`. | Per-handler logging options continue to shallow-merge over global defaults. | **Behavior/config change possible.** Compare effective options handler-by-handler so previously quieter handlers do not become noisier; `loggerProvider` migration itself is non-breaking. |
| S-10 | P1 | users-api still owns `TelemetryBridgeBehavior` (infrastructure/behaviors), whose only job is to copy addon `context.items` symbols into the OTel attribute bag. | Every application wanting integrated telemetry must know internal addon symbols and repeat the same glue. | Move a transport-neutral observation/attribute bag into core. Addon behaviors write observations through core; OTel reads the bag automatically; delete the app-specific bridge. | Addons take no OpenTelemetry dependency. Trace/metrics `attributeFactory` remains; metrics keep cardinality safeguards. | **No intended break if attribute names/item symbols are preserved.** Removing exported addon item symbols is a separate API/observability break. |
| S-11 | P2 | `PipelineModule.forRootAsync` cannot infer providers from factory-returned `globalBehaviors`, so the sample lists behavior classes statically and again in runtime composition. | A technically valid distinction that looks like duplicate configuration and is easy to misread. | Allow static `globalBehaviors` on `PipelineModuleAsyncOptions` and auto-register those classes as in `forRoot`; let `useFactory` return only genuinely dynamic values; merge deterministically. | `behaviors` remains for handler-only custom registration; the existing async factory form stays valid. | **No — additive.** Previously valid configurations must keep working. |
| S-12 | P2 | `QueryRepository` stores only `cache`; each aggregate query repeats `hydrateFn: User.fromJSON/Role.fromJSON` and `alwaysHydrate:true`. | Rehydration is repository identity, not a per-method decision. Repeating it risks one cached path leaking snapshots while another returns aggregates. | Let `QueryRepository` take an optional repository-level hydrator/serializer policy once; `@FromCache` then normally declares only key and TTL. | Full `@FromCache({...})` stays valid for mixed-result repositories; method options override repository defaults. | **No if repository defaults are optional.** A mandatory new constructor argument would be a source break. |
| S-13 | P2 | `UsePipeline` writes class metadata with `Reflect.defineMetadata`; repeated pipeline decorators overwrite rather than compose. | Blocks safe package-level decorator sugar and makes future declarative decorators fragile. | Add one internal metadata merge primitive with `BehaviorId` dedupe, deterministic top-to-bottom order and documented option merging, used by `UsePipeline`, typed intents and `SkipPipeline`. | A single current `@UsePipeline(...)` behaves exactly as before. | **Behavior break for code that stacks pipeline decorators today.** Treat compose-instead-of-overwrite as an explicit semantic change and test/document ordering. |
| ~~S-14~~ | ~~P2~~ | `packages/pipeline/src/index.ts`, `pipeline.module.ts`, `pipeline.context.ts`, `interfaces/pipeline.context.interface.ts` | **Closed.** `PipelineBootstrapService` is unexported from `@nestjs-pipeline/core` and from `PipelineModule.forRootAsync` exports, remaining strictly an internal provider. `originalCorrelationId` and `SET_ORIGINAL_CORRELATION_ID` are removed, converging on `correlationId`. `PIPELINE_TENANT_ID` and its duplicate `context.items` mirror are removed, converging on canonical `context.tenantId`. Coherent builders, serializers, adapters, and stores (U-05 through U-12) remain intact. | — | — | Closed. |
| ~~S-15~~ | ~~P0~~ | `PIPELINE_BEHAVIOR_CONTRACT` implemented in 7 production files, including `CacheBehavior`'s `order`/`validate` pair (cache.behavior.ts:84-135) | **Done.** Core stays addon-agnostic; behaviors expose validation and ordering metadata; deterministic misconfiguration and hard ordering violations fail at bootstrap with handler, behavior, missing field and remediation named. | — | Custom behaviors without a contract remain supported; intentionally passive global declarations remain allowed. | Shipped additively. |
| ~~S-16~~ | ~~P1~~ | Typed pipeline context items. | **Done.** Core exports `PipelineItemToken<T>`, `createPipelineItem`, `getPipelineItem`, `setPipelineItem`, `requirePipelineItem`, `hasPipelineItem`, and `MissingPipelineItemError`. | Tokens infer value types; required reads reject missing or undefined entries with item, request and handler diagnostics. | Raw `context.items` and existing string/symbol identities remain unchanged; explicit keys provide interoperability. | **Additive.** Existing consumers need no migration. |
| S-17 | P1 | Applications with recurring non-global policy bundles repeat the same ordered `@UsePipeline(...)` entries across handlers; `UsePipeline` metadata makes ad-hoc composed decorators unsafe until S-13. | Teams duplicate policy stacks or write custom decorators that overwrite metadata and order. | After S-13, expose a pipeline preset/composed-decorator primitive so an application defines a named policy bundle once. Prefer app-owned presets over a core `@Policies({...})` that knows every addon. | Raw `@UsePipeline` remains fully available; presets expand to ordinary inspectable entries. | **No — additive.** Only code opting into presets uses the new path. |
| S-18 | P2 | `packages/pipeline/src/services/pipeline.bootstrap.service.ts` concentrates handler discovery, metadata/option merge, singleton and scoped resolution, runner construction, prototype patching, multi-application ownership and cleanup in one unit. | The complexity is real Nest integration cost, but independent decisions have no clean boundaries, which makes compatibility changes risky. No bootstrap defect beyond the already-closed identity collision was demonstrated. | Extract a pure `compilePipelinePlan(metadata, globals)` returning an immutable ordered plan with resolved options; extract runner construction/execution; keep one Nest integration adapter as the only layer aware of private framework shapes. Three cohesive units, not a class count target. | Public decorators and module configuration unchanged; accepted CQRS integration not replaced. | **No intended break.** Describe it as maintainability, not a security or performance fix. Existing lifecycle/scoped-context tests become characterization tests. |

---

### Table 5 — Immediate users-api cleanup requiring little or no framework redesign

These are concrete current-state changes, not speculative new abstractions.

| ID | Current location | Simplification | Why safe | Breaking change / migration impact |
|---|---|---|---|---|
| ~~A-01~~ | ~~`ddd/users-api/src/infrastructure/reliability.module.ts`~~ | ~~Remove `CacheModule.forRoot(...)` and its export until a real `CacheBehavior` consumer exists.~~ | **No longer applies.** `GetUserOverviewHandler` consumes `CacheBehavior` in production. | Superseded — see S-08 and N-01. |
| A-02 | `ddd/users-api/src/infrastructure/observability.module.ts:96` | Use `loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: NativeLogger }` instead of `extraProviders`. | It is the purpose-built current API. | **No.** Equivalent provider binding through the dedicated option. |
| A-03 | same module and the 10 handlers declaring it | Configure `LoggingBehavior` global default `requestResponseLogLevel:'log'`; remove identical local tuples; keep local `mapLogLevel` where it differs. | Bootstrap already shallow-merges handler options over global options while preserving global position. | **Behavior/config change possible.** Compare effective logging so previously quieter handlers do not become noisier. |
| ~~A-04~~ | ~~`ddd/users-api/src/users/persistence/update-user.command-repository.ts`~~ | ~~Remove `@MapPersistenceErrors({ unique: [] })` when it has no `otherwise`.~~ | **Done.** No semantic no-op mapper invocation remains in users-api. | Closed. |
| A-05 | User/Role/Auth/Capability aggregates | Remove empty `afterUpdate(): void {}` implementations after the base hook becomes a no-op. | No semantic change. | **No.** Requires S-05 first; runtime lifecycle unchanged. |
| A-06 | user/role delete repositories | Replace the copied optimistic-delete algorithm with one ddd-core helper. | Same conditional delete and diagnostic semantics; less duplicated safety code. | **No intended break.** Internal deduplication; see F-09 for the transaction-boundary requirement. |
| ~~A-07~~ | create-user/create-role/create-auth key factories | **Done with S-07.** All three use the partitioned package helpers and the `'anonymous'` principal fallback is removed. | The package helpers own escaping and missing-context policy. | Idempotency continuity preserved by the `v1` namespace; rate-limit buckets reset once. |
| A-08 | `TelemetryBridgeBehavior` | Delete after addons write standardized core observation attributes directly. | Same trace enrichment with less application-specific glue. | **No intended break if emitted OTel attribute names/values stay identical.** |
| ~~A-09~~ | `ddd/users-api/src/users/jobs/send-welcome-email.processor.ts:49-57`; `batch-update-users.processor.ts:95-107` | **Done.** Renamed processors to `SimulatedSendWelcomeEmailProcessor` and `SimulatedBatchUpdateUsersProcessor` (preserving backwards-compatible aliases); removed artificial `setTimeout` delays; returned explicit simulation results (`SimulatedWelcomeEmailResult`, `SimulatedBatchUpdateResult`) and logged honest simulation demonstration statements. | Naming and result semantics only; preserved teaching value of BullMQ worker and queue integration. | Closed. |

---

### Table 6 — Public-surface classification: sample usage is not a deletion criterion

A public library API is not dead merely because `ddd/users-api` does not call it. Each candidate is classified by **external library value**. "Remove" is reserved for true implementation leakage, compatibility duplication, or repository-local no-ops.

| ID | Surface | Library value outside users-api | Recommendation | Breaking change / migration impact |
|---|---|---|---|---|
| ~~U-01~~ | ~~`IPipelineContext.originalCorrelationId`, backing field, `SET_ORIGINAL_CORRELATION_ID`~~ | Low. Compatibility duplicate for the already-immutable `correlationId`. | **Done.** Removed; all code and tests converge on `correlationId`. | Closed. |
| ~~U-02~~ | ~~`PIPELINE_TENANT_ID` item mirror plus `SET_TENANT_ID` writing both property and item bag~~ | Low-to-medium compatibility value. Duplicate state can diverge. | **Done.** Removed mirror and constant; canonical access converged on `context.tenantId`. | Closed. |
| ~~U-03~~ | ~~root export of `PipelineBootstrapService` (`packages/pipeline/src/index.ts:33`)~~ | Very low. Framework patching machinery, not an extension contract. | **Done.** Stopped exporting it; kept strictly as an internal provider of `PipelineModule`. | Closed. |
| ~~U-04~~ | ~~`CaslAuthorizerOptions` while constructors repeat an inline `{ bypass?: boolean }`~~ | **Useful public type.** External consumers configuring authorizers benefit from one named shape. | Retain and use it in the constructor/static API; remove the duplicated inline shape, not the capability. | **No** if signatures are rewritten to the equivalent named type. Applied: the constructor overloads use `CaslAuthorizerOptions`; a construction-compatibility test covers it. **No longer applies:** CASL v2 removed `bypass`, and `CaslAuthorizerOptions` with it. |
| U-05 | `cacheKeyTemplate` | **Useful declarative API.** Removes manual key concatenation, namespaces by tenant, canonicalizes values and fails fast on missing placeholders — exactly the "framework remembers the mechanics" helper this project should favour. | Retain and document as a normal persistence-cache helper. | **No change recommended.** |
| U-06 | `RootEntity.from(...)` polymorphic rehydration | **Useful ergonomic/safety helper** for adapters receiving either a hydrated aggregate or a snapshot; it rejects incompatible instances rather than guessing. Used in production by `get-users.handler.ts`. | Retain. S-12 may reduce its frequency, not its value. | **No change recommended.** |
| U-07 | `buildCache`, `buildKeyv`, `buildAuditRecord`, `buildDeadLetterRecord`, `buildResiliencePolicy`/`PolicyBuildContext`, feature-evaluation helpers, public Zod inspection helpers | **Legitimate advanced extension points.** They let custom modules and adapters reuse package-owned normalization, redaction, policy construction and validated/raw request state without copying internals. | Retain as documented advanced APIs unless a specific helper exposes unstable private state. Do not prune as a set. | **No change recommended.** |
| U-08 | convenience re-exports such as `stableStringify` from cache/idempotency and `uuidv7` from correlation | **Real ergonomic value:** a consumer stays inside the package it is already using. | Keep when intentional and documented. | **No change recommended.** |
| ~~U-09~~ | ~~users-api `@MapPersistenceErrors({ unique: [] })` without `otherwise`~~ | ~~None as library API.~~ | **Done.** No such invocation remains. | Closed. |
| ~~U-10~~ | ~~users-api `CacheModule.forRoot` with no pipeline-cache behavior consumer~~ | ~~Unused sample wiring only.~~ | **No longer applies.** A production consumer exists. | Superseded — see S-08. |
| U-11 | exported addon observation/item symbols — cache hit/key, rate-limit result/key, feature-flag decision, idempotency replay state, dead-letter state | **Useful integration surface** for custom logging, telemetry, audit, diagnostics and behaviors. | Retain during S-10. A neutral observation bag may reduce direct symbol reads but must not delete these hooks without a migration plan. | **No change recommended during S-10.** |
| U-12 | provider/store/transport interfaces and bundled adapters/sinks/stores | **Core library extensibility.** This is how consumers bring their own Redis/Postgres/broker/auth provider while keeping behavior semantics. | Keep public and stable. Simplification should make the default path easier, not close adapter seams. | **No change recommended.** |
| U-13 | `ddd/users-api/src/persistence/memory-store.ts`, `store.interface.ts` | Unclassified. They are sample-workspace infrastructure, not a published package, but `IStore` is the abstraction both MikroORM stores implement. | Classify before acting: published API, reusable extension point, test fixture, optional wiring, or truly internal state. A local reference search cannot settle it for an exported abstraction. | **Unknown until classified.** Do not delete on reference count alone. |

---

### Table 7 — Things that look complex but should **not** be simplified away

| ID | Area | Why the complexity is currently justified | Safe simplification boundary |
|---|---|---|---|
| K-01 | CASL type-level precheck + loaded-entity authorization | A behavior running before the handler cannot safely evaluate rules that depend on persisted entity state. Removing the second `authorizer.authorize(...loadedEntity...)` would weaken authorization — N-01 is precisely what its absence costs. | Improve syntax and types and add guardrails, but keep the loaded-entity check explicit after authoritative load. CASL v2 applies this: `requires(...)` declares the type-level check, and handlers call `authorize(action, loadedEntity, fields)` or `project(...)` after the load. Do not move user authorization into infrastructure repositories to hide the call. |
| K-02 | `PipelineBootstrapService` discovery/prototype/scoped-handler logic | Nest CQRS 11 exposes no public handler middleware covering commands, queries and events with equivalent request-scoped behavior resolution. A custom bus fork would be more code and more coupling. | Hide the service from the public API (U-03), decompose it internally (S-18), and keep its private-Nest dependency mechanically guarded. Do not replace the mechanism. |
| K-03 | Resilience `handle(error)` and command/event `retry.replaySafe:true` requirements | They force the caller to acknowledge failure classification and replay safety. Removing them makes whole-handler retries easier but less correct. | Typed intent helpers and presets may reduce syntax; the safety decision stays explicit. |
| K-04 | D-01 event durability gap | Moving in-memory publication into a behavior removes handler boilerplate but does not make it transactional. | Preserve current semantics until the owner decides whether an outbox is required. |
| K-05 | D-03 direct MikroORM accessor mapping | Public hydration setters are a known trade-off that keeps the sample smaller. Removing them alone requires a persistence-record architecture. | Do not bundle that redesign into these simplifications. |
| K-06 | Separate addon modules/stores/transports | Audit, dead-letter, idempotency, rate-limit, flags and cache have legitimately different backend contracts. A generic "behavior module factory" would save internal lines but make types, docs and debugging worse. | Normalize conventions, names and typed intent helpers; keep explicit modules. |
| K-07 | Business identity for authorization/cache/rate-limit/idempotency | The framework can own escaping, partition mechanics and missing-context failure, but it cannot infer whether a quota is per user or per account, or whether two requests are the same business operation. | Typed tokens, module-level resolvers and package key builders should make the decision easy to state once. Do not infer principal identity from arbitrary request fields or hash the whole command as a universal idempotency default. |
| K-08 | Two cache layers: repository (`@FromCache`/`@Cache`/`ICache`) and pipeline (`CacheBehavior`) | They have different owners and different invalidation domains. The persistence adapter owns snapshots and lookup keys because it knows the write lifecycle; the application use case owns composed results because it knows their dependencies, security scope and freshness. `GetUserOverviewHandler` is the first in-repository demonstration of both in one flow. | Keep both. Define their keys, expiry and dependencies separately. Do not move application composition into a repository to cache it, and never claim that entity invalidation invalidates a composed pipeline result. |

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

Typed-intent style, shipped in S-02:

```ts
@UsePipeline(
  requires('create', 'User'),
  featureFlag({ flag: 'user-registration' }),
  rateLimit({ keyFactory: perEmail }),
  idempotent({ keyFactory: createUserKey }),
)
```

There is still one pipeline decorator and one visible execution order.

For the global-except-special-case pattern, shipped in S-01:

```ts
@CommandHandler(InternalRebuildCommand)
@SkipPipeline(AuditBehavior)
export class InternalRebuildHandler implements ICommandHandler<InternalRebuildCommand> {
  // ...
}
```

No behavior-specific fake option, no module-scope restructuring, no duplicate behavior class.

#### Domain layer

`@Mutate()` expresses the right invariant — version and timestamp lifecycle belongs to the aggregate, not to every caller — but F-05 shows its current interaction with event construction is wrong. The target shape after F-05 and S-05:

```ts
export class User extends RootEntity<UserSnapshot> {
  update(fields: UserUpdateFields): this {
    // validate, apply state, run the update lifecycle, then record the event
    // from the resulting snapshot
  }

  // no empty afterUpdate() required
}
```

Do **not** auto-generate domain events inside `@Mutate()`. Explicit event classes carry domain meaning and handler identity.

#### Repository layer

Preferred normal write after S-03:

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
  // only the actual database operation remains here
}
```

The decorator owns the existing lifecycle: persistence/error translation, acknowledgment of the persisted version, then best-effort cache maintenance after durable success. Individual decorators remain available for advanced repositories.

---

### Security-specific simplification

Simplification is valuable only if it removes security decisions from repetitive call sites without hiding decisions that are inherently domain-specific.

#### Authorization

Can be simplified: typed `requires(...)` intent (formerly `authorize(...)`) instead of a raw `Record<string,unknown>`; global principal/context resolution; helper APIs making field lists typed against known mutable fields.

Must stay explicit: the authoritative entity load; the instance-level `authorizer.authorize(action, loadedEntity, fields)` call; the application's choice of which fields are changing. N-01 showed what disappears when the second item is skipped; it is now closed.

A "magic repository authorization decorator" is **not** recommended. Authorization is an application policy depending on actor plus loaded domain state; pushing it into persistence would violate the repository boundary and make bypasses harder to audit.

#### Cache / rate-limit / idempotency keys

The framework owns segment escaping, tenant partitioning and missing-context failure. The application owns only the business discriminator: which request/result dimensions can change the authorized response; who shares a quota; what business operation a key represents.

> Call-site code selects identity; package helpers construct the safe key.

---

### Implementation order

Correctness first, then real duplication, then new abstractions that need maintenance.

1. **F-06, F-07** — isolated correctness fixes with direct regressions.
2. **F-05** — mutation/event ordering; changes domain method shape, so land it before S-03/S-04 touch the same paths.
3. ~~**N-01**~~ — closed; restore entity/field authorization in the composed cached query; add the cross-principal regression.
4. **N-02, N-04, N-05, N-06** — documentation and hygiene fixes; cheap and independent.
5. **F-04** — idempotency replay scope, with its store round-trip and namespace migration plan.
6. **F-09 + S-06** — `assertAutocommit` and `optimisticDelete`, migrating both delete repositories.
7. **F-01 residual** — decide and implement the unversioned-adapter policy.
8. ~~**F-16**~~ — closed; application-owned dead-letter classification verified by 19 passing tests.
9. ~~**S-16**~~ — closed; additive typed context item API. Existing raw-key consumers remain compatible.
10. **S-09 / A-02 / A-03** — logging defaults and `loggerProvider`.
11. **S-05 + A-05** — default no-op `afterUpdate` and removal of empty overrides.
12. **S-07 / A-07** — partitioned key builders, migrating the manual factories.
13. **S-03** — `@PersistedWrite`, after the F-01/F-09 contracts are settled.
14. **F-11** — honest snapshot contract and optional copy-on-read access.
15. **F-14** — one shared EntityManager resolution predicate.
16. **S-13**, then **S-17** — metadata composition and app-owned presets.
17. **S-10 / A-08** — core observation bag, then delete `TelemetryBridgeBehavior`.
18. **S-04** — `PublishDomainEventsBehavior`, only after equivalence is proven and D-01 is answered.
19. **S-11**, **S-12** — async static globals and repository hydration defaults.
20. **F-15 / S-18** — bootstrap decomposition once behavior identity and diagnostics are stable.
21. **S-14 / U-01…U-03** — narrow compatibility cleanup in an intentional breaking release.
22. **A-09**, **F-17** — example honesty and documentation authority, alongside the related fixes rather than at the end.

---

### Required tests for the outstanding work

#### Correctness regressions

- mutation events: aggregate version 2 produces payload version 2; `updatedAt` matches; rejected mutations emit nothing and do not increment; earlier event snapshots are unchanged by later mutations; optimistic writes still use the previous persisted version;
- audit: both delete handlers emit a record containing action, actor, tenant and target metadata, asserted on the emitted record; an unknown option property is a compile error in a typed literal;
- Set equality: distinct object entries with equal shapes, unequal multiplicities, insertion-order independence, nested Sets/Maps, and symmetry; a behaviour-level case where a Set entry is mutated without changing size must revalidate and reject;
- event snapshots: deep detachment from the aggregate; ordinary nested-property freeze; documented Date/Map/Set prototype-mutation behaviour; isolated copies where configured; transport rejection or conversion of unsupported payloads.

#### Authorization and caching

- two principals with different field permissions receive different overview payloads, and a cache hit never crosses that boundary;
- a permission change that does not change the viewer's role set must not serve a stale authorized response;
- missing tenant or principal fails closed rather than producing a shared namespace;
- entity invalidation does not silently imply pipeline-result invalidation.

#### Persistence lifecycle

- matching version deletes succeed; stale version conflicts raise `ConcurrencyConflictError`; missing rows raise `EntityNotFoundException`;
- an outer transaction is rejected before mutation on update, delete and acknowledging create paths;
- a failed create/update leaves the expected version unchanged, and no event publication or invalidation occurs on rejection;
- composite `@PersistedWrite` matches the canonical order: persistence failure means no acknowledgment and no cache mutation; success acknowledges before cache write; delete barrier/eviction semantics unchanged; individual decorators still work standalone.

#### Cache coordination

- invalidate after the final read but before fill; two competing fills; update/delete/recreate; secondary-key changes; expired value then fresh replacement; retry exhaustion; database success with cache outage; tenant isolation; detached hydration; primitive-type and delimiter key collisions;
- memory and database adapters tested against the same observable contract;
- an adapter implementing only `get`/`set` follows the decided policy instead of silently entering the legacy path.

#### Idempotency

- same-principal same-scope replay; changed permissions without a changed command; user and service principals with equal IDs; missing actor/tenant/ability; legacy scope-less records; changed payload fingerprints; no side effect on replay-scope mismatch; store round-trips preserve the new field.

#### Dead-letter classification

- expected rejections create zero records; an unexpected processor failure creates exactly one; a post-success completion error cannot schedule a command replay; observability overrides merge the policy instead of replacing it.

#### Pipeline composition (regression coverage for shipped work)

- global behavior runs by default; `@SkipPipeline(Behavior)` removes only that behavior and preserves the relative order of the rest; contradictory local add plus skip fails at bootstrap; singleton and scoped handlers; command, query and event scopes; two Nest applications in one process do not share installed runners;
- typed intent builders produce exactly the current entry shape and reject missing activation fields; raw tuples remain accepted;
- bootstrap diagnostics name handler, behavior, missing field and remediation; an intentionally passive global declaration remains allowed; custom behaviors without a contract remain supported.

---

### Expected result

After this work the sample should read like an application built **with** a framework rather than one explaining the framework's implementation.

A normal developer should mainly need to know `@UsePipeline(...typed intents...)`, `@SkipPipeline(...)` for the rare global exception, the aggregate's domain methods, `@PersistedWrite(...)` / `@FromCache(...)` at repository boundaries, and explicit loaded-entity authorization wherever persisted state matters.

The implementation continues to own behavior resolution, order and deduplication; global/default option merging; context, correlation and tenant propagation; safe partition construction; cache mutation barriers and CAS; optimistic concurrency diagnostics; persistence lifecycle ordering; event publication lifecycle; observability plumbing; bootstrap-time diagnostics; typed cross-behavior context access; and reusable policy-preset composition without metadata overwrite.

## Final disposition

For the current CASL/package follow-up, use C2-01 and C2-02 above. The following disposition belongs to the broader repository backlog; it does not extend the requested scope.

E-01 and E-02 are implemented. F-02, F-03, F-05, F-06, F-07 and F-08 are implemented, F-10 no longer applies after CASL v2, and F-01 is implemented, including its unversioned-adapter policy. S-01, S-02 and S-15 are shipped; A-04 and U-09 are closed; S-08, A-01 and U-10 are superseded by a real pipeline-cache consumer.

F-11 is a reproduced defect on this branch and is the next implementation target. N-01 and N-03 are closed. F-16 is closed; its 19 classification tests passed on 2026-09-21. F-14 and F-17 remain open from code-path evidence. N-02, N-04, N-05, N-06 and N-07 remain open from this review, and D-04 records an owner decision on audit coverage.

D-02 and D-03 are resolved and must not be reopened as side effects of other work. D-01 remains owner-gated: do not introduce an outbox, and do not let S-03 or S-04 imply durability they do not provide.

V-01 and V-02 record what this review did not execute. No claim of a full green gate is made for this commit.

The executable implementation contract is `docs/reviews/LLM.Agent.Implementation.Brief.md`; that brief is subordinate to this review and must not reinterpret D-01.

---

## Προτεινόμενη σειρά εκτέλεσης εργασιών (D, S, F, N)

Ο πίνακας ενοποιεί τις δύο προηγούμενες ελληνικές λίστες σε μία. Κριτήριο είναι πρώτα η ορθότητα, μετά η μείωση πραγματικής επανάληψης και τελευταίες οι νέες αφαιρέσεις που χρειάζονται επιπλέον συντήρηση. Οι εργασίες D απαιτούν απόφαση του ιδιοκτήτη· όπου υπάρχει ήδη καταγεγραμμένη απόφαση, αξιολογείται η εφαρμογή της. Οι ολοκληρωμένες εργασίες παραμένουν με διαγραφή και σχόλιο, ώστε να μην επανεξεταστούν.

| Α/Α | Κωδικός | Τύπος | Αντικείμενο | Κατάσταση και αιτιολόγηση σειράς | Συνοπτικό «πώς» |
|---|---|---|---|---|---|
| — | ~~**D-02**~~ | Αρχιτεκτονική απόφαση | Αυτόνομο `AggregateRoot` στο domain (Option C) | **Ολοκληρώθηκε.** Το domain entry point δεν φορτώνει `@nestjs/*` ούτε `@mikro-orm/*`. Ξεκλείδωσε τα S-04, S-05 και D-01. | `aggregate-root.ts`, `event.interface.ts` στο `ddd/core/domain`· μηχανικός έλεγχος απομόνωσης στο `domain-entry-point.spec.ts`. |
| — | ~~**D-03**~~ | Αρχιτεκτονική απόφαση | Ενθυλάκωση aggregates vs άμεσο mapping MikroORM | **Ολοκληρώθηκε.** Διατηρήθηκε το `accessor: true` με `@internal`/`@deprecated` και συντακτικό guard. Ο κανόνας βασίζεται σε ονόματα δεκτών (`user`, `role`, `aggregate`, `entity`) και δεν καλύπτει τύπους, aliases ή δυναμικά keys. | `aggregate-identity.grit` με κάλυψη bracket/compound assignments· αρνητικά tests στο `biome-general-plugins.spec.ts`. |
| — | ~~**S-01**~~ | Απλοποίηση (P0) | Καθολική παράκαμψη behavior (`@SkipPipeline`) | **Ολοκληρώθηκε**, με test απομόνωσης δύο εφαρμογών: η εκτέλεση behavior άλλης εφαρμογής θα παραβίαζε την απομόνωση tenant/context. | Φιλτράρισμα βάσει `BehaviorId` πριν το DI resolution· fail-fast σε ταυτόχρονη δήλωση `@SkipPipeline` και `@UsePipeline`. |
| — | ~~**S-02**~~ | Απλοποίηση (P0) | Τυποποιημένοι intent builders | **Ολοκληρώθηκε** σε επτά πακέτα. Εντοπίζει λανθασμένα options κατά τη μεταγλώττιση χωρίς νέο runtime μηχανισμό. | Μικροί builders που επιστρέφουν τα υπάρχοντα tuples, με υποχρεωτικά activation fields. Τα raw tuples παραμένουν. |
| — | ~~**S-15**~~ | Απλοποίηση (P0) | Διαγνωστικά bootstrap και behavior contracts | **Ολοκληρώθηκε.** Καλύπτει δυναμική παραμετροποίηση και περιπτώσεις που οι τύποι δεν ελέγχουν. | Προαιρετικό contract ανά behavior (`PIPELINE_BEHAVIOR_CONTRACT`), έλεγχος πραγματικών effective options, σαφή μηνύματα με handler, behavior και διόρθωση. |
| 1 | ~~**F-06**~~ | Ορθότητα (P1) | Audit options που αγνοούνται σιωπηλά | **Ολοκληρώθηκε.** Μετονομασία σε `metadata`, χρήση `audit({...})` intent builder, καταχώρηση `AUDIT_MODULE_DEFAULTS` με trusted session actor στο `AuditModule.forRoot`, compile-time guards και tests στο `deletion-audit-records.spec.ts`. | Closed. |
| 2 | ~~**F-07**~~ | Ορθότητα (P1) | Λανθασμένη ισότητα Sets στο Zod fast path | **Ολοκληρώθηκε.** Υλοποίηση σύγκρισης Sets με κατανάλωση ενός προς ένα (one-to-one consumption) στο `equalData`, ανεξαρτησία σειράς, προστασία από cycles και regressions για συμμετρία, πολλαπλότητα και επανέλεγχο μετά από mutation (commit `dc6b1499`). | Closed. |
| 3 | ~~**F-05**~~ | Ορθότητα (P1) | Events με προηγούμενο version και timestamp | **Ολοκληρώθηκε.** Συντονισμός κύκλου ζωής mutation και κατασκευής event μέσω `@Mutable` backing fields και `@ApplyMutation({ event })` method decorator. Το event λαμβάνει το επικαιροποιημένο snapshot (v2 και νέο `updatedAt`), ενώ σε αποτυχία validation τίποτα δεν τροποποιείται. Ελέγχεται με Biome Grit κανόνα `domain-mutation.grit`. | Closed. |
| 4 | ~~**N-01**~~ | Ασφάλεια (P1) | Σύνθετο cached read model χωρίς entity/field authorization | **Ολοκληρώθηκε.** Ενιαίο `project('read', user, candidate)` πάνω στο φορτωμένο aggregate: έλεγχος entity και μάσκες πεδίων σε μία κλήση, άρα η σύνθετη απάντηση δεν επιστρέφεται χωρίς αυτόν. Ρόλοι και additional capabilities απαιτούν `read` στο subject `UserCapabilities`, αποτιμώμενο ως προς το id του χρήστη-στόχου, και κλείνουν fail-closed. Η ανάγνωση δηλώνει `refresh: true`, με regression πάνω στο πραγματικό `GetUserQueryRepository` και πραγματικό `MemoryCache` που αποδεικνύει ότι stale cached department δεν κρίνει πρόσβαση. | Closed. |
| 5 | ~~**N-03**~~ | Ασφάλεια (P1) | Audit actor σύνδεσης από το σώμα του αιτήματος | **Ολοκληρώθηκε.** Μια εντολή πριν την αυθεντικοποίηση καταγράφει **δήλωση**, όχι ταυτότητα: `claimedIdentityActor()` επιστρέφει `{ authenticated: false, claimedEmail }`, χωρίς `id`, άρα η εγγραφή δεν περνά φίλτρο έμπιστης δραστηριότητας. Το fallback `'anonymous'` καταργήθηκε. Η διεύθυνση παραμένει στο `record.payload.email` και το `code` παραμένει redacted, με assertions εκπεμπόμενης εγγραφής μέσω του πραγματικού `CommandBus`. | Closed. |
| 6 | ~~**F-04**~~ | Ασφάλεια (P1) | Replay idempotency χωρίς δέσμευση στο permission scope | **Ολοκληρώθηκε.** Το κλειδί της λειτουργίας παραμένει σταθερό και versioned· το replay δεσμεύεται χωριστά μέσω `replayScopeFactory`, με το digest να υπολογίζεται **πριν** τη δέσμευση του κλειδιού και να αποθηκεύεται ως `replayScope` σε όλα τα stores. Μια ολοκληρωμένη εγγραφή επαναλαμβάνεται μόνο σε ακριβή ταύτιση· σε αναντιστοιχία ή σε εγγραφή χωρίς scope προκύπτει `replay_scope` (`409`), χωρίς επανεκτέλεση και χωρίς διαγραφή της εγγραφής. Στο users-api το κλειδί προκύπτει από έμπιστο principal συνεδρίας (tenant, ρητό `principalType`, id) και το fallback `'anonymous'` καταργήθηκε. | Closed. |
| 7 | ~~**F-09 + S-06**~~ | Ορθότητα (P1) / επανάληψη (P2) | Κοινό optimistic delete και ενιαία απαίτηση autocommit | **Ολοκληρώθηκε.** Ένα `optimisticDelete` στο `ddd-core` με το ίδιο συμβόλαιο affected rows όπως το `optimisticUpdate`, και ένας κοινός έλεγχος `assertAutocommit` σε update, delete και create. Ο έλεγχος προηγείται κάθε statement, ώστε μια απορριπτόμενη εγγραφή να μην αλλάζει τίποτα: ούτε βάση, ούτε persisted baseline, ούτε cache. | Closed. |
| 8 | ~~**F-01**~~ | Ορθότητα (P2) | Υπόλοιπο: πολιτική για adapters χωρίς revisions | **Ολοκληρώθηκε.** Ρητή πολιτική: το `@FromCache` κάνει cache μόνο μέσω adapter που ικανοποιεί το `isVersionedCache`, ενώ έναν adapter μόνο με `get`/`set` τον **παρακάμπτει πλήρως**, σε ανάγνωση και σε εγγραφή. Η επικίνδυνη διαδρομή get/set διαγράφηκε αντί να τεκμηριωθεί, και η παράκαμψη καταγράφεται μία φορά ανά adapter. | Closed. |
| 9 | ~~**F-16**~~ | Λειτουργικός θόρυβος (P2) | Πολιτική DLQ για αναμενόμενες απορρίψεις | Εξαρτάται από το F-04: το `IdempotencyCompletionError` μετά από επιτυχία δεν είναι επαναληπτέα εργασία. | **Closed.** Η πολιτική `DEAD_LETTER_DEFAULTS` εξαιρεί αναμενόμενες απορρίψεις και `IdempotencyCompletionError`, διατηρώντας την καταγραφή απρόβλεπτων σφαλμάτων. Επαληθεύτηκε με 19/19 tests. |
| 10 | ~~**S-16**~~ | Απλοποίηση (P1) | Τυποποιημένα tokens για το `context.items` | **Done.** Typed accessors και `MissingPipelineItemError` στο core. | Το raw Map διατηρείται· explicit keys επιτρέπουν συνεργασία με υπάρχοντα string/symbol keys χωρίς αλλαγή ταυτότητας. |
| 11 | **S-09 / A-02 / A-03** | Απλοποίηση (P1) | Κοινές ρυθμίσεις logging και `loggerProvider` | Μειώνει επανάληψη με ήδη διαθέσιμα APIs, χωρίς νέα υποδομή. | Global `requestResponseLogLevel`, σύγκριση effective options ανά handler, σύνδεση `NativeLogger` μέσω `loggerProvider`. |
| 12 | **S-05 / A-05** | Απλοποίηση (P1) | Προεπιλεγμένο no-op `afterUpdate` | Μικρό ανεξάρτητο βήμα στο δικό μας `RootEntity`. | Μετατροπή σε concrete `protected afterUpdate(): void {}` και διαγραφή των κενών overrides. |
| 13 | ~~**S-07 / A-07**~~ | Ασφάλεια (P1) | Ασφαλή partitioned keys σε rate-limit και idempotency | **Ολοκληρώθηκε.** Κανένα κλειδί ασφαλείας δεν χτίζεται πια με το χέρι στο users-api. Τα rate-limit keys χρησιμοποιούν το `createPartitionedRateLimitKeyFactory` και προστέθηκε το συμμετρικό `createPartitionedIdempotencyKeyFactory`, με escaping όλων των segments και fail-closed σε απόντα tenant ή principal, χωρίς κοινό fallback. Το fallback `'anonymous'` καταργήθηκε. | Closed. |
| 14 | **S-03** | Απλοποίηση (P0) | Σύνθετος διακοσμητής `@PersistedWrite` | Μετά τη σταθεροποίηση των συμβολαίων F-01/F-09, ώστε να μην κωδικοποιηθεί λανθασμένο συμβόλαιο συναλλαγής. | Σύνθεση των τριών decorators στην κανονική σειρά, με προεπιλεγμένο entity extractor το πρώτο όρισμα. Τα επιμέρους APIs παραμένουν. |
| 15 | **F-11** | Συμβόλαιο (P2) | Διάκριση detachment από runtime immutability | Δεν είναι exploit· είναι λανθασμένη υπόσχεση στο τεκμηριωμένο συμβόλαιο. | Διατήρηση του deep detachment, διόρθωση της τεκμηρίωσης, προαιρετικό copy-on-read accessor, αυστηρή σειριοποίηση στα adapters μεταφοράς. |
| 16 | **F-14** | Συντήρηση (P2) | Ενοποίηση επιλογής tenant EntityManager | Διπλές αποφάσεις ασφαλείας κινδυνεύουν να αποκλίνουν ανά driver. | Ένας εσωτερικός resolver με ρητές εισόδους· κοινή table-driven σουίτα και για τους δύο adapters, με περιπτώσεις ενεργής συναλλαγής. |
| 17 | **S-13 → S-17** | Απλοποίηση (P2 → P1) | Σύνθεση metadata και presets πολιτικών | Το S-13 αλλάζει τη σημερινή συμπεριφορά overwrite, άρα γίνεται μόνο όταν χρειαστεί το S-17 ή πραγματικά stacked decorators. | Ένας μηχανισμός merge με τεκμηριωμένη σειρά και deduplication· μικρά app-owned presets που επεκτείνονται στα ίδια entries. |
| 18 | **S-10 / A-08** | Απλοποίηση (P1) | Core observation bag και κατάργηση `TelemetryBridgeBehavior` | Υπό όρους πραγματικής επαναχρησιμοποίησης· δεν πρέπει να δημιουργήσει μεγαλύτερο framework. | Μικρό ουδέτερο bag στο `IPipelineContext`, ίδια attributes και exported hooks, χωρίς έκθεση ευαίσθητων keys. |
| 19 | **S-04** | Απλοποίηση (P1) | `PublishDomainEventsBehavior` | Αναβολή μέχρι να αποδειχθεί ισοδυναμία: η αφαίρεση boilerplate δεν δικαιολογεί ρίσκο διπλής ή χαμένης δημοσίευσης. | Innermost global command behavior, ένας μόνο ιδιοκτήτης δημοσίευσης ανά handler, tests για retry, replay, nested commands και μεταβατική συνύπαρξη. |
| 20 | **S-11 / S-12** | Απλοποίηση (P2) | Στατικά globals σε async module· προεπιλογές hydration | Χρήσιμα αλλά όχι επείγοντα· εισάγουν κληρονομούμενες ρυθμίσεις που θέλουν σαφείς κανόνες. | Προαιρετική στατική ρύθμιση με καθορισμένο merge· προαιρετική hydrator policy στον `QueryRepository` με ρητή προτεραιότητα των method overrides. |
| 21 | **F-15 / S-18** | Συντήρηση (P2) | Διάσπαση bootstrap σε planning, execution και Nest integration | Μετά τη σταθεροποίηση ταυτότητας behavior και διαγνωστικών. Δεν τεκμηριώθηκε επιπλέον bootstrap bug. | Καθαρή `compilePipelinePlan`, ξεχωριστός runner, ένας Nest adapter για τα ιδιωτικά APIs· τα υπάρχοντα lifecycle tests ως characterization tests. |
| 22 | ~~**S-14 / U-01…U-03**~~ | Καθαρισμός (P2) | Στοχευμένος καθαρισμός δημόσιας επιφάνειας | Μόνο για πραγματική διαρροή υλοποίησης· οι εξωτερικοί καταναλωτές δεν αποτυπώνονται στη χρήση του sample. | **Done.** Παύση export του `PipelineBootstrapService`, αφαίρεση `originalCorrelationId` και `PIPELINE_TENANT_ID` mirror, σύγκλιση σε `correlationId` και `context.tenantId`. |
| 23 | ~~**N-02, N-04…N-07, A-09**~~; **F-17 open** | Τεκμηρίωση/υγιεινή (P2–P3) | Ακρίβεια τεκμηρίωσης, ονόματα tests, simulated jobs | Φθηνά και ανεξάρτητα· εκτελούνται μαζί με το σχετικό fix, όχι στο τέλος. | **Partially done; F-17 remains open for documentation corrections and import-boundary lint-rule renaming.** Διορθώθηκε το README των cache helpers και επεκτάθηκε ο doc guard, αφαιρέθηκαν ticket IDs και banners από tests, προστέθηκε ρητό σχόλιο & warn log στο catch του CAS, προστατεύθηκε το audit dereference, και έγινε ειλικρινής ονομασία & επιστροφή αποτελέσματος στους simulated processors χωρίς setTimeout. |
| 24 | **D-01** | Αρχιτεκτονική απόφαση | Transactional outbox / ανθεκτική παράδοση events | Απόφαση νωρίς, όχι αυτόματη υλοποίηση. Το ανεξάρτητο `AggregateRoot` δεν λύνει την ατομικότητα. | Αν «ΝΑΙ»: πίνακας `OutboxRecord` και ατομική εγγραφή στο ίδιο DB transaction με ασύγχρονο idempotent relay. Αν «ΟΧΙ»: διατήρηση του in-memory EventBus και τεκμηρίωση του crash window. |
| 25 | **D-04** | Αρχιτεκτονική απόφαση | Εύρος κάλυψης audit στα command handlers | Το audit καλύπτει 3 από 8 handlers· δημιουργία και ενημέρωση χρηστών και ρόλων δεν αφήνουν ίχνος. Προϋπάρχον θέμα εύρους, όχι defect. | Απόφαση ποιες μεταβολές χρειάζονται ίχνος και γιατί, με severity και redaction ανά handler. Μια αλλαγή capability ρόλου είναι αλλαγή εξουσιοδότησης, όχι λιγότερο ευαίσθητη από μια διαγραφή. |
