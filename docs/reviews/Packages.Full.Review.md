# nestjs-pipeline: full package review and implementation blueprint

**Reviewed:** 2026-09-16  
**Final baseline:** `db2c2a66692d0d574a5990455d6d8564177f3104`  
**Scope:** all 12 reusable packages under `packages/*`  
**Review type:** independent architecture, correctness, public API, integration, testing, and release review  
**Deliverable:** recommendations only; no implementation changes are included in this review.

## Navigation

- [Assessment and verification](#1-executive-assessment)
- [Disposition of the supplied reviews](#4-reconciliation-with-the-supplied-reviews)
- [Findings and implementation proposals](#5-findings-current-status-and-implementation-proposals)
- [Feature Flags design](#6-feature-flags-detailed-target-design)
- [OpenTelemetry design](#7-opentelemetry-detailed-target-design)
- [Latest changes](#9-final-code-change-review)
- [Delivery roadmap](#11-delivery-roadmap-with-concrete-completion-criteria)
- [Reproduction examples](#12-reproduction-examples)

## 1. Executive assessment

Keep the package architecture. It has useful boundaries: a Nest CQRS execution engine, independent behavior packages, and small interfaces for stores, sinks, and transports. A rewrite into a framework-independent CQRS engine would discard the main value of the project.

The latest changes resolve a substantial portion of the two supplied reviews. Feature flags now have stable targeting, detailed decisions, provider-error policy, and variant gating. OpenTelemetry now has semantic attributes, request-local enrichment, bounded default metric dimensions, and an active-execution counter. Resilience requires explicit error classification and command/event replay acknowledgment. Cache payloads are hashed, logging has configurable sensitive-key redaction, and Zod shares its runtime output-shape assertion.

However, passing package tests still overstates consumer readiness. The earlier compiled CASL bootstrap regression is now fixed and reverified. Remaining reproduced gaps concern correlation-based cache isolation, error preservation in tracing, ambiguous rate-limit partitions, lost Zod output typing, and the newly accepted string-actor authorization overload.

The next work should close these gaps and strengthen consumer-level verification before adding more features.

### Priority definitions

- **P0 — release blocker:** a normal supported integration fails or a security guarantee needs immediate correction before relying on it.
- **P1 — next implementation cycle:** a concrete correctness, reliability, or contract problem.
- **P2 — planned improvement:** maintainability, ergonomics, compatibility cleanup, or additional capability.

Priority is not a CVSS rating. Conditional risks below include their triggering conditions; they are not claims that every deployment is affected.

## 2. Scope, evidence, and limitations

The two supplied documents were read as review inputs, not accepted as proof of the current implementation. After the code changed during the review, the report was refreshed against the clean `db2c2a6` baseline on September 16. All package builds/tests, repository checks, compiled-consumer probes, and the Zod declaration probe were repeated. Earlier intermediate test failures are excluded from the final assessment.

Inspection covered package entry points, behavior execution, module wiring, options, relevant helpers/adapters, manifests, package tests, READMEs, and the new production notes. Repository rules and the [architecture skill](../../.agents/skills/nestjs-pipeline-architecture/SKILL.md) govern architectural recommendations. The DDD documentation and canonical handler examples are architectural references; `ddd/core` and `ddd/users-api` are **not included in the defect inventory**.

Evidence categories:

| Label | Meaning |
|---|---|
| Reproduced | Executed against freshly compiled current packages or their declarations |
| Confirmed by inspection | A concrete code path supports the finding; the triggering external system was not exercised |
| Contract limitation | A real boundary of the design, not necessarily an implementation bug |
| Proposal | A recommended future API or behavior, not an existing feature |

Fresh verification on Node `v24.13.0`, pnpm `11.18.0`:

| Check | Result |
|---|---|
| `pnpm --filter './packages/*' --no-bail build` | All 12 package builds passed |
| `pnpm --filter './packages/*' --no-bail test` | All 12 package test commands passed |
| `pnpm lint:persistence` | Passed; 590 files checked |
| `pnpm check` | Passed; 590 files checked, no diagnostics |
| Compiled CASL Nest application-context probe | Passed with the current explicit factory registration |
| CASL string-actor overload probe | Three-argument call returned the action string in bypass mode instead of the entity |
| Core package dry-run | Both license documents present; earlier omission resolved |
| Cache reuse probe with identical correlation ID | Second caller received first caller's response |
| Throwing tracing-provider probe | Telemetry exception replaced the original business exception |
| Rate-limit partition probe | Different tenant/principal pairs produced the same key |
| Zod generated declaration/type probe | Invalid output assignments and nonexistent method access compiled without errors |

The targeted probes were temporary files outside the repository. They tested actual built exports, not copied implementations. The cache probe used a minimal map-backed store, the trace probe a deliberately throwing provider, and the CASL probe a real Nest application context.

Not performed: a Nest 10/11 matrix, external Redis/PostgreSQL/RabbitMQ tests, Docker application E2E, load tests, historical upgrade migrations, or a vulnerability scan. Passing unit tests does not establish those guarantees.

## 3. Package inventory and architectural verdict

Versions below come from the reviewed manifests, not a registry lookup.

| Package | Version | Responsibility | Verdict |
|---|---:|---|---|
| `@nestjs-pipeline/core` | 0.1.19 | CQRS discovery, behavior composition, context, logging | Keep; tighten DI, identity, async configuration, and compatibility verification |
| `@nestjs-pipeline/audit` | 0.1.0 | Execution records and sinks | Keep; document post-success failure and serialization boundaries |
| `@nestjs-pipeline/cache` | 0.1.0 | Query result read-through cache | Keep; replace correlation-based security claim and finish ownership fix |
| `@nestjs-pipeline/casl` | 0.1.2 | Request authorization and loaded-entity projection | Keep; DI repaired; fix actor overload and unify denial errors |
| `@nestjs-pipeline/correlation` | 0.1.9 | Async-local correlation propagation | Keep; hardening exists but remains opt-in |
| `@nestjs-pipeline/deadletter` | 0.1.0 | Failure capture through transports | Keep; strengthen actual resilience composition and delivery wording |
| `@nestjs-pipeline/feature-flags` | 0.1.0 | OpenFeature evaluation translated into execution gates | Keep; now materially useful, with remaining failure/composition details |
| `@nestjs-pipeline/idempotency` | 0.1.0 | Atomic claims and response replay | Keep; address serialization-after-success and clock semantics |
| `@nestjs-pipeline/opentelemetry` | 0.1.9 | Execution spans and metrics | Keep; complete fail-open behavior and define integration semantics |
| `@nestjs-pipeline/rate-limit` | 0.1.0 | Rate consumption through a backend port | Keep; fix partition encoding and required-tenant policy |
| `@nestjs-pipeline/resilience` | 0.1.0 | Cockatiel policies around downstream execution | Keep with explicit replay limits; prefer adapter-level retries for effects |
| `@nestjs-pipeline/zod` | 0.1.7 | Schema-backed request classes and validation | Keep; fix output typing regression |

The production dependency direction remains healthy: add-ons depend on core; correlation now declares core as a workspace runtime dependency rather than a peer; technology-specific libraries stay in their integration packages. Structural backend interfaces let consumers supply `pg`, Redis, queue, or limiter clients without putting those dependencies in application handlers.

Preserve these decisions:

1. Global-before → handler-local → global-after → handler execution order. “After” means later in the wrapper chain, not a post-handler callback.
2. A handler override changes a matching global behavior's options without moving its security-sensitive position.
3. Entity authorization and field projection occur after loading real state.
4. Owner-conditioned idempotency completion and deletion.
5. Cache behavior does not use background `wrap()` refresh to replay downstream work.
6. Attempt-local cancellation signals in resilience.
7. Transport-neutral application errors, translated at the presentation boundary.
8. No automatic outbox or distributed exactly-once promise.

## 4. Reconciliation with the supplied reviews

### 4.1 Full-package review

| Earlier finding | Current disposition | Remaining work |
|---|---|---|
| Broad whole-handler retries | Substantially addressed | Safeguards exist; replay safety remains an application assertion; update old examples |
| Idempotency completion failure lacks identity | Addressed for store-completion exceptions | Serialization failure and ownership expiry remain distinct states |
| Raw request payload in cache key | Addressed | SHA-256 `cache:v2:` format exists; correlation is still not an authorization partition |
| Payload logging lacks default redaction | Partially addressed | Masking options exist, but sensitive-key masking defaults to false; see F11 |
| Private Nest compatibility lacks a matrix | Open | Package tests exercise one installed dependency combination |
| Async module API conflates providers/runtime | Partially addressed | Static logger and runtime type added; factory types and tuple compatibility still permit ignored fields |
| Broad DI exception catch | Open | Missing providers still become request-time resolution attempts |
| Zod output-shape mismatch | Addressed at runtime | New `any` default weakens generated output types |
| Incoming correlation value validation | Partially addressed | Options exist; historical unbounded default remains |
| OTel readiness heuristic | Addressed | Removed for both tracing and metrics |
| Same-name behavior identity collisions | Open | Class-name fallback remains |
| Correlation used as feature targeting identity | Addressed | No implicit targeting key; explicit factory supported |
| Cache caller ownership and loader diagnostics | Partially addressed | Factory fixed; adapter still mutates stores; native-binding errors still misclassified |
| Cross-package contract testing | Partially addressed | Dead-letter retry-loop tests added, but not a real resilience integration matrix |
| Audit/deprecation/documentation debt | Mixed | Audit error-preservation wording improved; READMEs and new production notes still disagree elsewhere |

### 4.2 Feature Flags and OpenTelemetry review

| Requested capability | Feature flags | OpenTelemetry |
|---|---|---|
| Stable explicit targeting | Implemented | Not applicable |
| Detailed evaluation result | Implemented | Not applicable |
| Provider variant gate | Implemented for boolean evaluation metadata | Not applicable |
| Provider-error policy | Implemented | Not applicable |
| Evaluation context composition | Implemented | Not applicable |
| No private SDK readiness detection | Not applicable | Implemented |
| Pipeline semantic attributes | Decision metadata exists | Implemented |
| Request-local enrichment | Decision item exists | Implemented through attribute bag |
| Duration/invocation/active metrics | Not applicable | Implemented |
| Bounded default metric labels | Not applicable | Mostly implemented; application-controlled names still need a bounded vocabulary |
| Instrumentation never changes outcome | Not applicable | Incomplete: tracing methods and diagnostic logger calls can throw |
| Automatic cross-behavior diagnostics | Not implemented | Application bridge needed; independent add-ons do not automatically populate the bag |

These capabilities should not be proposed again as if missing. Finish their execution contracts, documentation, and consumer tests.

## 5. Findings, current status, and implementation proposals

### ~~F01 — CASL compiled-provider construction regression — resolved~~

> **Resolved.** Verified at commit `ba0b57d`. Already marked resolved by that review. See [Claude.Review.md](Claude.Review.md#6-status-of-the-earlier-reviews).

**Status:** resolved and reverified against the final baseline. **Original priority:** P0.

**Locations:** [entity-authorization.helper.ts](../../packages/pipeline-casl/src/helpers/entity-authorization.helper.ts), [casl.module.ts](../../packages/pipeline-casl/src/casl.module.ts).

At the earlier checkpoint the directly registered authorizer had optional TypeScript constructor parameters but no optional Nest injection metadata. Its compiled `design:paramtypes: [Object, Object]` caused normal Nest module bootstrap to fail, although isolated package tests passed.

The current module explicitly registers:

```ts
{ provide: CaslAuthorizer, useFactory: () => new CaslAuthorizer() }
```

This correctly expresses the module's ambient-ability contract without injecting arbitrary `Object` tokens. A fresh build followed by real `NestFactory.createApplicationContext()` returned `CASL_BOOTSTRAP ok`. The `ENTITY_AUTHORIZER` alias remains attached to the authorizer provider. Keep the repair; no further runtime fix is proposed here.

**Remaining test improvement:** retain a compiled or packed consumer bootstrap test that resolves the authorizer and alias, checks missing-ability denial, and closes the application. Manual construction and source transforms alone do not validate production decorator metadata. Direct class registration outside `CaslModule` needs an explicit construction contract too.

**Migration:** normal module consumers need no change. Keep manual explicit-ability and bypass usage supported.

### F02 — Correlation-based default caching is not a security boundary

**Priority:** P0 when protected responses rely on the documented default. **Evidence:** reproduced.

**Locations:** [cache-key.ts](../../packages/pipeline-cache/src/helpers/cache-key.ts), [HTTP correlation middleware](../../packages/pipeline-correlation/src/middlewares/http-correlation.middleware.ts), [pipeline.context.ts](../../packages/pipeline/src/pipeline.context.ts).

The default key now hashes the payload:

```text
cache:v2:<optional tenant>:<correlation ID>:<request name>:<payload digest>
```

This fixes raw payload exposure. It does **not** prove principal or permission isolation. HTTP clients can reuse an incoming correlation ID, and nested executions deliberately inherit correlation IDs. A correlation ID identifies related work; it is neither an authenticated actor nor a unique execution scope.

Reproduction with two contexts having the same tenant, query, payload, and correlation ID:

```text
first handler result:  { visibleTo: 'alice' }
second intended result: { visibleTo: 'bob' }
second actual result:   { visibleTo: 'alice' }
handler executions: 1
```

The vulnerability requires a shared cache, repeated key dimensions, and identity-dependent results. This is not a claim that an attacker can guess any victim's identifier. It shows that the advertised default isolation does not hold when correlation is reused, known, or externally assigned. Formatting or length validation of that ID does not fix this.

**Immediate action:** remove “security-safe” claims based solely on correlation. For protected results, use an explicit authenticated partition or bypass pipeline caching.

**Target contract — proposed:** distinguish execution-local memoization from shared result caching. Execution-local state can live on the actual context or in a WeakMap keyed by context. Shared caching requires an explicit key policy. Do not inherit a new execution identifier as if it were correlation, and do not equate two different contexts merely because they share a string.

A protected shared key should hash a structured tuple containing service namespace, tenant, principal, authorization version/scope, stable operation ID, payload, and any response-changing variant. Required security fields must throw when absent. An entity ownership/ACL change may require resource-policy invalidation even when a principal's roles have not changed.

**Acceptance:** different principals with the same incoming correlation ID cannot replay each other's data; missing required tenant fails before cache lookup; permission/resource-policy changes invalidate or partition responses; explicit public caching still shares safely. Retain the payload digest and test against delimiter ambiguity.

**Migration:** introduce a new cache namespace for changed keys. No dual-read from unsafe keys. Document expected cold caches and the distinction between request memoization and shared caching.

### F03 — Tracing can replace the business outcome; metrics have a smaller related gap

**Priority:** P1. **Evidence:** tracing reproduced; metrics logger gap confirmed by inspection.

**Locations:** [trace.behavior.ts](../../packages/pipeline-opentelemetry/src/trace.behavior.ts), [metrics.behavior.ts](../../packages/pipeline-opentelemetry/src/metrics.behavior.ts).

Custom attribute and span-name factories are guarded. Calls to `getTracer`, `startActiveSpan`, `setAttributes`, `setAttribute`, `setStatus`, `recordException`, and `end` are not fully isolated. An exception from `span.end()` in `finally` replaces the original business error. A success-path enrichment error is caught as if the business operation failed.

The probe executed the handler once, threw a business error, then threw from `end()`; the caller received `span end failure`, not the business error.

Metrics catch instrument failures, but their catch blocks invoke the injected logger without another guard. A throwing diagnostic logger can still prevent `next()` or replace a result/error. Conforming OTel implementations aim not to throw during normal execution; this finding concerns the stronger fail-open guarantee claimed for the integration and extension points. See the [OpenTelemetry error-handling contract](https://opentelemetry.io/docs/specs/otel/error-handling/).

**Implementation:**

1. Capture business success/failure independently of instrumentation.
2. Guard each optional instrumentation operation, including span termination and diagnostic logging.
3. Keep a single business execution promise. If span creation fails before execution begins, execute that promise without tracing.
4. If span startup invokes its callback and subsequently fails, return the existing business promise; never call `next()` again.
5. Preserve thrown values by identity, including non-Error values and `undefined`.

Do not implement `try { tracedNext() } catch { next() }`: that can execute a successful mutation twice.

**Acceptance:** inject failures at tracer acquisition, span startup, callback startup, attribute setting, exception recording, status, end, each metric operation, and logging. Assert exactly one handler execution and unchanged business result/error. Test normal no-op API and real provider paths too.

**Migration:** additive reliability fix. Keep the current span names, metric names, and units.

### F04 — Zod's no-base generated requests lose output type safety

**Priority:** P1. **Evidence:** reproduced through emitted declarations.

**Location:** [create-zod-request.ts](../../packages/pipeline-zod/src/create-zod-request.ts).

The new constructor alias defaults its instance type to `any`:

```ts
type AbstractConstructor<T = any> = abstract new (...args: any[]) => T;
```

When no base class is supplied, the returned instance is effectively `any & z.output<TSchema>`, which is `any`. The schema input remains useful, but the generated output instance loses its property checks.

This compiled with **zero diagnostics** under strict TypeScript:

```ts
const Request = createCommand(z.object({ name: z.string() }));
const request = new Request({ name: 'valid' });
const wrongNumber: number = request.name;
request.nonexistentMethod();
```

**Implementation:** use a concrete empty-base default whose instance is `object`, preserving constructor argument flexibility separately. For example, keep the justified `any[]` argument constraint but default the instance generic to `object`; preferably model the omitted base as an explicit `new () => object` type. Verify existing base constructor inference before selecting the exact signature.

**Acceptance:** declaration-level type tests must reject nonexistent methods, assigning string output to number, and invalid inputs; accept transformed output types; preserve custom base fields and constructor arguments. Use `@ts-expect-error` tests and an `IsAny` assertion, not only runtime tests.

**Migration:** corrective type change. Runtime behavior remains unchanged. The shared plain-output assertion is good and should remain.

### F05 — Partitioned rate-limit keys can collide and silently omit tenants

**Priority:** P1. **Evidence:** collision reproduced; missing-tenant behavior confirmed by inspection.

**Location:** [partitioned-key.ts](../../packages/pipeline-rate-limit/src/helpers/partitioned-key.ts).

The helper joins optional tenant, principal, and request name with `:` without encoding component boundaries:

```text
tenant='a:b', principal='c' → a:b:c:GetUserQuery
tenant='a', principal='b:c' → a:b:c:GetUserQuery
```

Both keys were identical in the probe. This permits unintended quota sharing; it is not direct response disclosure. `includeTenant: true` also means “include if present,” not “require tenant.” The missing-partition fallback returns a global request bucket without tenant partitioning.

**Implementation:** serialize a fixed-position tuple with an explicit null/absence marker, then hash or safely encode it. Add `requireTenant` separately from `includeTenant`. Keep application-wide operation buckets as an intentional supported mode. Clarify whether `onMissingPartition: 'request'` means globally shared or tenant-operation shared; avoid a silent interpretation.

**Acceptance:** colon/backslash/Unicode inputs, absent versus present tenant, same local principal in different tenants, and fallback behavior. Prove unequal tuples never collapse through delimiter concatenation.

**Migration:** version the namespace. During a rolling transition, old/new buckets can each grant capacity; plan the rollout around the limiter window or deliberately use a stricter temporary limit.

### F06 — Cache ownership correction stops at the factory

**Priority:** P1. **Evidence:** confirmed by inspection.

**Locations:** [cache-factory.ts](../../packages/pipeline-cache/src/helpers/cache-factory.ts), [cache-manager.adapter.ts](../../packages/pipeline-cache/src/adapters/cache-manager.adapter.ts).

`buildCache()` now preserves caller-owned cache/store settings. But `CacheBehavior` constructs `CacheManagerAdapter`, whose constructor still sets `store.throwOnErrors = true` on every supplied store. Module initialization therefore still changes a shared store's behavior, contradicting the updated ownership documentation.

**Implementation:** remove ownership mutation from the adapter. Set error behavior only when constructing package-owned Keyv instances. Document that caller-owned instances determine whether backend errors are observable. Keep the operation-local AsyncLocalStorage error capture; it correctly avoids conflating concurrent operations on the same key.

**Acceptance:** assert the original setting before factory construction, after behavior construction, and after execution. Cover both a prebuilt cache and prebuilt stores. A factory-only ownership test is insufficient. Consider listener cleanup when repeatedly creating adapters around the same cache.

**Migration:** restores the documented ownership contract. Consumers that need thrown errors from shared stores should configure them explicitly.

### F07 — Adapter-loading diagnostics still misidentify broken installations

**Priority:** P2. **Evidence:** confirmed by inspection.

**Location:** [cache-factory.ts](../../packages/pipeline-cache/src/helpers/cache-factory.ts).

The narrowed missing-module classification is an improvement, but `error.message.includes('bindings file')` still classifies an installed adapter with a missing native binary as an absent adapter. The public message recommends installing the adapter even though the actual issue is a native build. The original cause is preserved, which reduces but does not eliminate the diagnostic problem.

**Implementation:** classify only resolution failure for the requested package as “adapter not installed.” Preserve native/transitive initialization errors, optionally wrapping with an accurate “adapter could not initialize” message and `cause`.

**Acceptance:** controlled tests for missing adapter, missing transitive dependency, native binding failure, and an arbitrary initialization error. Do not make an “adapter missing” test depend on what optional package happens to be installed in the developer's workspace.

### F08 — Core async registration still permits ignored configuration

**Priority:** P1. **Evidence:** confirmed by inspection.

**Locations:** [pipeline.module.ts](../../packages/pipeline/src/pipeline.module.ts), [pipeline-module.options.ts](../../packages/pipeline/src/options/pipeline-module.options.ts).

Static async logger registration is implemented. `PipelineRuntimeOptions` exists, but `useFactory` and `PipelineOptionsFactory` still return the full module options. Async `behaviors` still accepts tuples while dropping their options. Documentation now acknowledges this for compatibility; the misleading executable contract remains.

**Implementation sequence:** first add explicit deprecation diagnostics for ignored factory provider fields and tuple options. Then use `PipelineRuntimeOptions` in all async factory forms, restrict static behavior registration to classes, and validate that configured execution behaviors can actually resolve. Allow providers from imported modules or explicit static registrations; do not insist on one redundant list when Nest can resolve them legitimately.

**Acceptance:** real Nest bootstrap tests for `useFactory`, `useClass`, `useExisting`, imported providers, static logger aliases, and missing behaviors. Compile-time tests must reject tuples after the compatibility transition. Update examples at the same time.

**Migration:** planned breaking contract cleanup, even while versions are `0.x`; publish explicit release notes and a mechanical before/after example.

### F09 — Provider resolution errors are still treated as scoping

**Priority:** P1. **Evidence:** confirmed by inspection.

**Location:** [pipeline.bootstrap.service.ts](../../packages/pipeline/src/services/pipeline.bootstrap.service.ts).

The broad catch around `moduleRef.get()` assumes a failed singleton lookup should be retried through per-execution resolution. A missing behavior token can therefore survive bootstrap and fail on the first request.

The earlier review overstates one trigger: ordinary singleton constructor/factory failures often happen during Nest initialization before this lookup. The precise confirmed issue is that **all lookup exceptions**, including missing registrations, are reclassified as scope.

**Implementation:** determine provider scope/dependency-tree behavior explicitly using supported Nest introspection. If private metadata is required, keep it within the already accepted private integration boundary. Resolve actual scoped providers per CQRS context; fail bootstrap for missing registrations. Preserve the original error/cause.

**Acceptance:** missing provider fails at bootstrap; singleton and request-scoped providers work; dependency scope bubbling works; the same CQRS context is reused; genuine initialization failures remain recognizable.

### F10 — Behavior identity can discard unrelated classes

**Priority:** P1. **Evidence:** confirmed by inspection.

**Locations:** [pipeline.decorator.ts](../../packages/pipeline/src/decorators/pipeline.decorator.ts), behavior planning in bootstrap.

`getBehaviorId()` uses explicit ID or class name. Different modules can export distinct classes with the same name, causing global deduplication and option lookup to treat them as one behavior. This is particularly dangerous if one is a security guard.

**Implementation:** use constructor reference as default identity and a deliberate stable ID for cross-copy identity. Apply the same identity type to metadata, option maps, planning, and context lookup. Do not fix only the decorator. The `PIPELINE_BEHAVIOR_ID` symbol itself currently uses `Symbol()`: cross-copy support also needs a deliberate shared metadata-key strategy, such as a namespaced `Symbol.for`, rather than assuming separate package copies share symbols.

**Acceptance:** unrelated same-name classes both execute; explicit equivalent IDs dedupe; local options retain global position; duplicate module-copy behavior is tested and documented. Decide whether repeated handler-local entries are allowed; current global deduplication is not a complete general deduplication contract.

**Migration:** planned breaking identity change. Deprecate the legacy process-global options registry and remove it at the same deliberate compatibility boundary.

### F11 — Sensitive logging protection is still opt-in

**Priority:** P1 when payload logging is enabled. **Evidence:** confirmed by inspection.

**Location:** [logging.behavior.ts](../../packages/pipeline/src/behaviors/logging.behavior.ts), `redactSensitiveKeys` and `buildSanitizeOptions()`.

Request/response payloads remain excluded by default, which is good. The new masking controls work, but `redactSensitiveKeys` explicitly defaults to `false`. Simply enabling payload logging still exposes default-sensitive fields unless another option is enabled. This is a partial implementation of the earlier recommendation, not default protection.

**Immediate configuration:** use `redactSensitiveKeys: true` wherever payload logging is enabled. Keep custom `redactKeys` additive and `excludeKeys` as complete removal.

**Target:** default sensitive masking to true with an explicit advanced opt-out. Review error `optionalParams` separately: they are still forwarded without the request/response sanitizer. Error messages, stacks, audit actor/metadata, feature provider messages, and physical custom keys are also separate channels; masking request properties does not sanitize arbitrary strings or structured metadata automatically.

**Acceptance:** text and structured logging, nested sensitive keys, error optional parameters, cyclic payloads, custom removal, and explicit opt-out. A logger throwing during error reporting must not replace the original business exception.

**Migration:** observable log-output change, not a business behavior change. Update snapshots intentionally; preserving a secret in an old snapshot is not a reason to keep the unsafe default indefinitely.

### F12 — Idempotency still releases claims after successful but unserializable execution

**Priority:** P1. **Evidence:** confirmed by inspection; post-success durability is also a contract limitation.

**Location:** [idempotency.behavior.ts](../../packages/pipeline-idempotency/src/idempotency.behavior.ts), `toJsonSnapshot()` failure path and completion path.

`IdempotencyCompletionError` correctly identifies a successful downstream execution whose store completion failed. Keep its `executionSucceeded`, claim identity, and original cause.

A different post-success failure remains: if response serialization fails, the behavior releases its owned claim and throws a generic TypeError. A handler returning a cycle, function-containing object, or other unsupported result may already have committed effects. The next retry can execute those effects immediately because the claim was deleted.

**Implementation:** classify all failures after `next()` resolves as finalization problems. Add a phase such as `snapshot` or `store` to a dedicated finalization error. On serialization failure, conservatively retain the owned claim until expiry or transition to an explicit non-replayable/uncertain state using an owner-conditioned operation. Do not pretend retention prevents all duplicates: it only prevents immediate reentry while the claim remains live.

Validate the response contract in application tests, ideally using transport-ready snapshots. Do not loosen strict serialization to silently drop unsupported data. Keep first-execution versus replay result shape documented: the first response can be an aggregate with `toJSON()`, while replay returns the stored plain snapshot.

**Acceptance:** a simulated successful side effect followed by an unserializable result must not immediately free the key; original cause and phase remain available; stale owners never delete newer claims; no post-success failure is automatically retried by resilience.

The execution/admin store split from the earlier review remains a useful optional API cleanup, not a prerequisite for this fix.

### F13 — PostgreSQL idempotency expiration mixes two clocks

**Priority:** P1 for distributed use. **Evidence:** confirmed by inspection, not tested against a live database.

**Location:** [postgres.store.ts](../../packages/pipeline-idempotency/src/stores/postgres.store.ts), `toValues()` and `completeIfOwned()`.

Expiry is created using application `Date.now() + ttlMs`, but validity is checked using PostgreSQL `now()`. An application clock behind the database can create an already-expired claim; another execution may reclaim it while the first handler is still running. A clock ahead of the database extends the intended claim lifetime.

**Implementation:** calculate and compare lease expiration using one authoritative database clock. Pass TTL as a parameter and compute expiration in SQL. Explicitly decide whether the port permits a long outer transaction: transaction-time and wall-clock semantics differ, and claim visibility must precede the protected work. Preserve application timestamps for descriptive audit fields if desired; do not use them for lease arbitration.

**Acceptance:** real PostgreSQL tests with deliberately skewed application time; concurrent claims; expiry/reclaim; stale completion; SQL null versus JSON null; and no uncommitted claim being advertised as globally exclusive.

The existing owner-sensitive SQL is worth preserving. This change corrects expiry policy; it does not replace conditional updates with read-then-write logic.

### ~~F14 — CASL uses two denial error families~~

> **Fixed 2026-09-18.** Verified at commit `ba0b57d`. The package now has one denial family: `UnauthorizedActionException`. See [Claude.Review.md](Claude.Review.md#113-f-01--casl-denials-are-transport-neutral).

**Priority:** P1 architecture/transport consistency. **Evidence:** confirmed by inspection.

**Locations:** [casl.behavior.ts](../../packages/pipeline-casl/src/casl.behavior.ts), [unauthorized-action.exception.ts](../../packages/pipeline-casl/src/exceptions/unauthorized-action.exception.ts).

Loaded-entity authorization throws `UnauthorizedActionException extends Error`, while request-level denial throws Nest `ForbiddenException`. The package participates in command, query, and event execution, so an HTTP-specific denial in this reusable execution path makes transport adapters inconsistent.

**Implementation:** introduce a framework-neutral request authorization error, or carefully extend the existing neutral denial type with reason codes such as `missing_principal` and `insufficient_permissions`. Add an optional HTTP filter that maps these to the intended status and a redacted response. Do not make core depend on CASL errors.

**Acceptance:** request denial and entity denial remain recognizable in HTTP and non-HTTP use; ability construction and loaded-entity filtering are unchanged. Preserve internal details for diagnostics while avoiding an uncontrolled payload in public error responses.

**Migration:** consumers currently catching `ForbiddenException` need a migration note and filter registration. This is separate from the now-resolved compiled DI repair.

### F15 — Feature evaluation failure bypasses the detailed decision record

**Priority:** P1 for observability; P2 for optional API expansion. **Evidence:** confirmed by inspection.

**Location:** [feature-flag.behavior.ts](../../packages/pipeline-feature-flags/src/feature-flag.behavior.ts).

Successful evaluation and default-value recovery store `FEATURE_FLAG_DECISION_ITEM`. With `errorPolicy: 'throw'`, `evaluate()` throws before `handle()` writes the decision item. An outer audit/telemetry behavior therefore cannot inspect the same structured result in the most operationally important failure case. A thrown client exception is also reduced to a message rather than preserved as `cause`.

**Implementation:** normalize evaluation details first, publish an immutable decision or evaluation record, then apply the gate/error policy. Keep “resolved false,” “variant denied,” “default used after provider error,” and “evaluation failed” distinct. Preserve the original cause on errors. If a context/targeting factory throws before evaluation, identify that as application context construction failure rather than inventing a provider response.

**Acceptance:** detailed provider error return and thrown client error both yield inspectable metadata; strict policy invokes neither handler nor fallback; disabled flags still run the configured fallback; the default-value policy remains explicit. Never attach the entire targeting context to traces automatically.

Provider variants are optional metadata, not synonymous with string flag values. The current package correctly calls a boolean details API and filters the returned variant. A future string experiment API should be separate and typed; do not interpret boolean variant filtering as support for every flag value type. These distinctions follow the [OpenFeature evaluation API](https://openfeature.dev/specification/sections/flag-evaluation/).

### F16 — Feature and telemetry integration is available, but not automatic

**Priority:** P1 documentation/composition; P2 shared helper. **Evidence:** confirmed by inspection.

**Locations:** [telemetry-attributes.ts](../../packages/pipeline-opentelemetry/src/telemetry-attributes.ts), package `PRODUCTION.md` files, feature/cache/idempotency context items.

The OTel attribute bag is owned by the OTel package and uses OTel `Attributes` types. Feature flags, cache, and idempotency publish their own context items, but no production bridge automatically maps them to telemetry. The new production guide correctly recommends an application integration behavior. The report should not claim installation alone produces every proposed diagnostic.

**Implementation now:** provide a complete application bridge example that reads selected items and writes safe attributes on unwind. Importing multiple add-ons is appropriate in the application's composition layer. Do not add OTel dependencies to each add-on.

**Later, only if repeated use warrants it:** put a tiny technology-neutral annotation key/type in core, or document a stable convention independent of OTel types. Keep it to scalar/array data and a small helper. No event bus, observer registry, or generic instrumentation framework is needed.

**Acceptance:** feature allowed/denied/provider failure, cache hit/miss/error, replay, rate rejection, and dead-letter capture all reach the outer trace where configured. Negative cases must not fabricate values for behaviors that never ran.

### F17 — Compatibility and release checks do not test the shipped product sufficiently

**Priority:** P1. **Evidence:** manifests, current test configuration, compiled probe, and package dry-run.

The package peers advertise Nest 10 and 11. CASL now additionally advertises `@casl/ability` 6 and 7; test both supported CASL lines, particularly deny precedence and nested field projection. The installed workspace primarily exercises Nest 11. Core intentionally uses `ExplorerService`, `InstanceWrapper`, CQRS context attachment, and wrapper hooks. Existing lifecycle tests are valuable but do not establish compatibility with both supported majors.

Add a packed-consumer project for each supported matching Nest/CQRS major. It must install built tarballs outside workspace aliases, bootstrap commands/queries/events, verify singleton and scoped behaviors, close the app, and run two apps in one process. Do not require `@nestjs/testing` in a published package just to do this; it can live in a private integration fixture.

**Packaging update — resolved:** the earlier core dry-run omitted the declared license documents. The latest release-preparation commit adds both documents to every package directory and a root `copy-licenses` step before `publish:all`. A fresh core `npm pack --dry-run --ignore-scripts --json` confirmed both documents in its file list. Keep an all-package tarball assertion in release automation so individual package publishing is also protected. The license omission is no longer an active defect.

Several packages use `prepublishOnly: build`, which does not remove stale output. Standardize a clean package build before packing; assert the archive includes declarations, current runtime files, required notices, and no tests, stale exports, private application imports, or unresolved workspace dependency notation.

**Acceptance:** actual packed install and bootstrap, not just `tsc` or a module-metadata snapshot. Audit peer ranges against tested combinations. Nest 12 examples in the Zod README must be explicitly outside the current declared support range unless a matching matrix is added.

### F18 — Documentation still describes multiple incompatible states

**Priority:** P1 for executable guidance, P2 for cleanup. **Evidence:** confirmed by inspection.

Examples:

- The feature-flags README still describes correlation-based targeting while `PRODUCTION.md` and source use explicit stable targeting.
- Cache README examples describe the pre-digest format; source uses `cache:v2:`.
- Resilience examples configure retry without all new required safeguards.
- The root/example documentation describes `pnpm test` as including build/E2E, but the root script currently delegates to unit testing; E2E has its own command.
- Cache factory ownership wording is stronger than the adapter's actual behavior.
- OTel failure guarantees are stronger than span-method/logger exception handling.

**Implementation:** merge production notes into canonical READMEs, replace branch-relative phrases, and add a release migration section. Treat historical reviews as dated evidence, not current specifications. Do not create another architecture ledger that duplicates several existing ones.

**Acceptance:** all quick-start snippets compile in a consumer fixture; documented defaults match options; migration examples exercise current exports. Link a supported-version table to actual tests. Delete stale references only after confirming the replacement path.

## 6. Feature Flags: detailed target design

### 6.1 What should remain

The package now earns its place by translating OpenFeature into execution behavior. Keep provider/client injection, explicit stable targeting, detailed results, module/handler context composition, boolean variant gates, and fallback policy. Do not implement providers, rollout algorithms, storage, dashboards, synchronization, or a second flag engine.

The current composition is:

```text
pipeline metadata
  + module evaluation context
  + handler evaluation context
  + non-empty explicit targeting factory result
  → OpenFeature boolean details
  → value + optional variant restriction
  → decision item
  → handler / fallback / disabled error
```

Targeting identity should represent the intended rollout unit. For tenant-local accounts, use a stable tenant/account tuple, not an account ID that can collide across tenants. A missing identity may be acceptable for an untargeted global flag; it is not acceptable for an application explicitly requiring sticky per-account rollout. Add a per-gate required-identity policy only where needed. OpenFeature leaves targeting context application-defined; see its [evaluation-context specification](https://openfeature.dev/specification/sections/evaluation-context/).

### 6.2 Proposed evaluation and enforcement separation

Normalize into a decision before applying the action:

```ts
// Proposed shape, not a current export.
interface GateDecision {
  flagKey: string;
  value: boolean;
  enabled: boolean;
  variant?: string;
  reason?: string;
  resolution: 'resolved' | 'defaulted' | 'failed';
  denialReason?: 'disabled' | 'variant_not_allowed' | 'evaluation_error';
  errorCode?: string;
}
```

Do not add every provider-specific field. Keep targeting identity internal unless deliberately needed by a consumer. Freeze the record or return detached copies so a later behavior cannot rewrite the historical decision.

Define these semantics explicitly:

| Situation | Suggested behavior |
|---|---|
| Flag not configured | Pass through; no evaluation record |
| Value true, no variant restriction | Continue |
| Value true, allowed variant | Continue |
| Value true, missing/unlisted required variant | Deny/fallback |
| Value false | Deny/fallback |
| Provider details contain error, default policy | Record defaulted evaluation and enforce default value |
| Provider failure, strict policy | Record failed evaluation and throw neutral evaluation error |
| Targeting/context factory throws | Preserve configuration/application cause; handler does not execute |
| Empty variant list | Document whether unrestricted or deny-all; current implementation treats it as unrestricted |

Strict-mode records should be visible to outer behaviors even when the gate throws. A fallback is a deliberate alternate outcome, not evidence the handler succeeded.

### 6.3 Cache, retries, and idempotency

For a gated query, evaluate the gate before a shared cache when disabling the flag must prevent serving cached data. If a variant changes the response, partition the result by variant or use explicit invalidation.

For retries, decide whether one logical execution uses one evaluation. Normally place the feature gate outside retry so a provider change does not switch implementation between attempts. The existing behavior evaluates once **per behavior invocation**, not magically once across arbitrary retry placement.

For idempotent commands, document the conflict between kill-switch enforcement and successful replay:

- Gate before idempotency: an emergency disable can block even an already-completed replay.
- Idempotency before gate: completed requests replay without reevaluation; new executions still reach the gate.

Neither ordering is universally correct. A replay must never silently reroute into a new variant that performs the mutation again. Separate a permission to return an existing response from permission to execute a new side effect when the product requires both.

### 6.4 Module/provider lifecycle

The module can register a global or named OpenFeature provider. Make the application ownership model explicit: a module should not globally shut down an externally supplied shared client/provider when one Nest app closes. Test named domains and two applications in one process before adding automatic teardown. Avoid per-request mutation of global evaluation context.

## 7. OpenTelemetry: detailed target design

### 7.1 Stable semantics and truthful scope

Keep the current span name `${requestKind}.${requestName}` and bounded handler identity fields. The behavior measures the downstream chain, which may short-circuit. Therefore `pipeline.handler.invocations` is not always the number of actual handler method calls. Document it as observed pipeline invocations at the behavior's configured position, or add a separate explicit actual-handler count later.

Do not rename existing metrics casually. Preserve milliseconds for the existing duration histogram. If migrating units or instruments, introduce a versioned instrument/migration plan; changing units under the same name corrupts dashboard assumptions.

### 7.2 Metric policy

Default attributes should be static operation identity plus bounded outcome classification. Correlation, principal, tenant, request values, targeting identity, and raw custom keys should not become labels automatically.

`error.name` is only bounded if application error names are stable. An application that dynamically sets names still creates unbounded labels. Allow an error classifier mapping to a documented finite vocabulary when needed.

The active counter currently adds and subtracts with the same base attributes, which is correct. Do not include outcome on its decrement: it would update a different time series. The [OpenTelemetry metrics API](https://opentelemetry.io/docs/specs/otel/metrics/api/) provides the counter/histogram instruments; the package must separately define what pipeline work they represent.

### 7.3 Prevent enrichment from falsifying semantic fields

Current context/factory merges can overwrite reserved fields. In metrics, custom attributes can even overwrite the authoritative outcome. Define precedence:

```text
custom allowed attributes
  + authoritative request/handler identity
  + authoritative final outcome/error classification
```

Reject or ignore attempts to overwrite reserved keys. Prefer an allowlist for metric enrichment rather than `includeContextAttributes: true` as the primary recommended example. Validate unknown runtime values before handing them to OTel; TypeScript types do not protect JavaScript consumers or arbitrary context contents.

Capture elapsed business/downstream time before awaiting post-execution attribute factories. Otherwise duration includes the enrichment callback. Decide whether total observed pipeline time intentionally includes that overhead, and name/document the measurement accordingly. Async factories can also delay completion indefinitely; keep them local and fast, or provide a bounded best-effort enrichment policy.

### 7.4 Recommended bridge ordering

For an application bridge that maps add-on context items into trace attributes:

```text
Trace
  → Metrics
    → Diagnostics bridge
      → authorization / feature / cache or idempotency / execution
```

The bridge should use `try/finally` to collect fields after downstream completion, including errors and short-circuits. It must finish before Trace finalizes its span. Putting the bridge only inside the cache miss path loses cache hits. Putting tracing after the gate loses rejected gates.

Suggested bounded facts:

| Source | Attribute | Scope |
|---|---|---|
| Feature decision | `pipeline.feature.key`, `.variant`, `.enabled` | Trace; metric only with an explicit bounded allowlist |
| Cache | `pipeline.cache.hit` | Boolean |
| Idempotency | `pipeline.idempotency.replay` | Boolean |
| Idempotency | `pipeline.idempotency.finalization_failed` | Boolean |
| Resilience | `pipeline.resilience.retries` | Per-execution count |
| Rate limiting | `pipeline.rate_limit.exceeded` | Boolean |
| Dead-letter | `pipeline.deadletter.published` | Capture success, not eventual delivery |

Do not capture request state in a callback stored on a cached resilience policy. Policies are shared by handler type; execution diagnostics must resolve the active attempt context.

### 7.5 Test matrix specific to observability

Test no SDK, enabled false, valid SDK, setup failure, instrumentation failure, business failure, thrown non-Error, cache hit, feature denial, successful replay, fallback, final retry exhaustion, and concurrent requests. Verify attribute isolation between requests and accurate active-count balancing. Test a bridge with the actual exported add-on classes in a private integration project.

## 8. Remaining package-specific guidance

### Core

Extract a pure behavior-plan function if changing identity/configuration. Keep private Nest discovery in one internal boundary and lifecycle restoration in the bootstrap service. Do not split every helper into an injectable micro-service.

`context.response` is assigned at the actual handler boundary. A cache hit, feature fallback, or idempotency replay may return without setting it; a result-transforming wrapper may also change the final response afterward. Either document it as the handler response or add a separate final pipeline outcome field. Outer behaviors should use the value returned by `await next()` for their observation. Do not build telemetry on the assumption that `context.response` always equals the caller's result.

### Audit

Keep `AuditSink`, existing redaction, JSON handling, and preservation of the original handler failure. `failOpen: false` after a successful write means “audit persistence is required for a successful response”; it does not roll back the already-executed business operation. Treat this as another post-success failure that must not trigger automatic mutation retry.

Actor and metadata factories are application-controlled data channels, not automatically safe because request redaction exists. Define serialization and privacy responsibilities. Diagnostic logging in catch paths needs the same error-preservation discipline as F03.

### Cache

Keep read-error fail-open behavior and avoid background downstream replay. Shared handler-output caches need explicit invalidation or an acceptable staleness contract. The DDD repository cache's CAS writes, hydration, and mutation barriers are separate features; they do not automatically protect `pipeline-cache` results. Do not claim parity between these two caches.

Hashing the payload bounds the payload portion and avoids raw key listings. It does not encrypt low-entropy values, bound arbitrary custom prefixes, or repair security partitioning. Keep key diagnostics free from raw custom keys when those contain sensitive identities.

### CASL

Preserve post-load checks and nested field projection. `subjectFromRequest` is useful for validating requested fields and intended operations; it cannot prove persisted ownership when the request supplies an ownership field. Keep the real-entity check after repository loading.

The actor-first overload is now explicitly deprecated. Do not rebuild permissions from an arbitrary actor object. Continue using the trusted request ability or a supplied complete ability. Keep bypass unmistakable and application-controlled.

### Correlation

The new options are useful: incoming acceptance, trimming, maximum length, and custom validation. Defaults deliberately preserve historical acceptance. Recommend a bounded visible-character policy for public HTTP inputs and test intermediary/array-header behavior. Do not force UUID-only interoperability.

A future safer default is reasonable with release notes. Even a validated identifier must never be treated as authorization, a rollout identity, or an idempotency key merely because it is called a request ID.

### Dead-letter

Keep the transport seam and preservation of the original failure. The new tests prove outer-versus-inner placement around a hand-written retry loop. Add a real `ResilienceBehavior` composition test before claiming cross-package coverage.

RabbitMQ confirm/backpressure handling is useful, but broker acceptance does not prove a consumer processed the message. Audit transport-specific guarantees and queue/exchange provisioning separately. A redacted failure record may not be a sufficient replay command. Do not equate capture with durable business-event delivery or a transactional outbox.

### Idempotency

Document a precise guarantee table:

| Condition | Actual guarantee |
|---|---|
| Live claim, no expiry | One claim owner for that key |
| Stale owner completes after reclaim | Cannot overwrite a newer owner |
| Handler runs longer than lease | Multiple handlers can overlap after expiry |
| Process crashes after side effect | Retry may execute the effect again |
| Store completion throws | New completion error identifies post-success uncertainty |
| Response serialization throws | Current implementation releases claim; F12 should change this |
| Ownership lost | Current implementation returns result and records ownership loss |
| Same operation retried by another principal | Safe replay depends on authenticated key partitioning |

Do not describe “one live owner” as “one running handler.” Lease renewal alone is not fencing. Stronger guarantees need application transaction design, unique business constraints, or downstream provider idempotency. Outbox work remains a separate decision.

### Rate limiting

The default per-operation bucket is valid for service-wide capacity. It is not a per-user limit. The new helper improves discoverability but needs F05. Backend failure defaults to fail-open; security-sensitive use cases should deliberately choose fail-closed and an appropriate backend. Avoid automatically treating a dependency outage as a user quota violation.

### Resilience

The new configuration checks are useful. A query can still call unsafe external operations, so query classification is not proof of replay safety. `replaySafe: true` is an explicit review assertion, not a transaction mechanism.

Keep provider/database retries around adapters when they know which operation is transient and safe. A whole-handler timeout does not cancel arbitrary I/O or undo writes. Aggressive timeout plus retry can overlap attempts unless downstream cancellation is respected.

Policies are cached by handler class and retain build-time request names in telemetry. A handler consuming multiple event types can report the first request name for later events. Keep shared breaker state where intended, but resolve current execution names/attempt counts dynamically. Do not partition breaker caches by arbitrary tenant IDs without a capacity/eviction policy.

### Zod

Keep identity-preserving validation and the shared plain-record assertion. Fix F04 before describing the factories as strongly typed without qualification.

The constructor and `parse()` remain synchronous; `ZodValidationBehavior` and the HTTP pipe support async parsing. Document the distinction rather than claiming async constructor validation. An async factory is a separate additive feature if demanded.

`safeParse()` currently forwards raw schema parsing and returns schema output rather than a constructed CQRS request. That is defensible if explicit in the contract; do not silently change it to construction while fixing output shape.

## 9. Final code-change review

The report was first refreshed through `ce845f9`, then refreshed again to `db2c2a6` on September 16. Header-only changes were separated from runtime changes. The relevant updates are:

| Change | Review result |
|---|---|
| CASL module uses an explicit authorizer factory | Correct repair for ambient ability; compiled Nest bootstrap passes |
| CASL legacy overload accepts string actors | New public contract mismatch; see F20 |
| CASL peer range includes ability v6 and v7 | Expand consumer compatibility tests accordingly |
| Correlation moves core from peer to runtime dependency | Verify the packed workspace dependency resolves and does not introduce duplicate core contexts |
| Package license files and root copy step added | Earlier artifact omission resolved; fresh core dry-run confirmed both notices |
| Delete-user/delete-role examples use top-level `handle`, `replaySafe`, structured backoff | Aligns examples with the public resilience configuration; replay acknowledgment still requires application semantics |
| Resilience accepts legacy `retry.isRetryable` | Compatibility bridge exists at runtime; missing from public options types |
| Resilience accepts legacy string backoff and `initialDelayMs`/`maxDelayMs` | Runtime compatibility added; normalization/validation needs a single explicit contract |

### F19 — New resilience compatibility code should normalize once

**Priority:** P2, or P1 if legacy configuration is a supported public contract. **Evidence:** confirmed by inspection of final changes.

The final update reads legacy options through casts in both `assertSafeConfiguration()` and `buildResiliencePolicy()`. It accepts string backoff at runtime without updating `RetryOptions` to model that form. An unknown string falls into a default exponential backoff rather than failing as an invalid configuration.

**Recommendation:** choose one of two deliberate contracts:

1. If legacy inputs are supported, describe them with a deprecated input union and normalize once into a strict internal `ResolvedResilienceOptions` before validation and policy construction.
2. If they were only stale example syntax, migrate examples and reject unsupported inputs rather than maintaining undocumented parsing paths.

Do not duplicate casts/classifier fallback in multiple files. Define precedence when both `handle` and `retry.isRetryable` are provided; the current implementation prefers `handle`. Unknown backoff names should produce a configuration error, not silently select a different strategy.

**Acceptance:** old/new forms produce the intended identical policy, top-level classifier wins, command retry still requires replay acknowledgment, invalid strings fail clearly, and typed examples match runtime support. Keep the existing attempt-local abort-signal semantics.

### F20 — String actor overload is accepted by types but misclassified at runtime

**Priority:** P1 public API correctness. **Evidence:** reproduced on the final baseline.

**Location:** [entity-authorization.helper.ts](../../packages/pipeline-casl/src/helpers/entity-authorization.helper.ts), `authorize()` overloads and argument dispatch.

The legacy actor overload now accepts `CaslUserContext | string`, with optional fields. But runtime dispatch recognizes the three-argument actor form only when the first argument is not a string. Thus `authorize('actor-1', 'read', entity)` is interpreted as `(action, subject, fields)`.

A direct probe using an explicit trusted bypass authorizer returned the string `'read'` instead of the entity. Without bypass, the method checks the wrong action/subject and can deny a valid operation. This is an overload-dispatch bug, not evidence of an unauthenticated authorization bypass.

**Implementation:** preferably remove string actors from the deprecated overload unless there is a documented consumer requirement. If supported, discriminate the three-argument signatures using the third argument's shape: a subject object/string versus a field-name array. Normalize arguments once, and reject ambiguous invalid combinations rather than guessing. Preserve the rule that an actor value does not construct an ability.

**Acceptance:** short-form string subject, short-form object subject with fields, object actor, string actor with and without fields, explicit ability, and bypass. Verify returned projected values and the exact action/subject passed to permission checks. Couple declaration tests with runtime tests so adding an overload cannot silently promise unsupported behavior.

## 10. Composition contracts to implement and test

There is no universal behavior order. Start with the use case and make short-circuit, observation, and retry boundaries explicit.

### 10.1 Protected query with shared result cache

```text
Trace → Metrics → Diagnostics bridge → Audit, if required
  → request validation
  → request/type authorization
  → feature gate, if required before cached results
  → explicit security-partitioned Cache
  → handler loads aggregate
  → entity authorization + field projection
  → response
```

Important qualifications:

- The outer guard does not replace entity authorization. The cache key/invalidation policy must account for the final authorized result because a hit skips the handler.
- Validation should precede payload-derived keys when normalization is part of identity.
- Auditing reads is optional and potentially expensive; make it a product requirement.
- If resource authorization can change independently of principal permissions, prefer caching authorization-independent aggregate data and authorizing on each request, or implement explicit policy invalidation.

### 10.2 Mutating command with response replay

```text
Trace → Metrics → Diagnostics bridge → logical-request Audit
  → request validation
  → authorization
  → optional rate consumption
  → Idempotency
  → handler + infrastructure adapters
```

Normally keep transient provider retry inside its infrastructure adapter. If whole-handler retry is justified, place it inside the claim boundary only after verifying every replayed effect and downstream behavior is safe. Exclude post-success finalization errors from retry classifiers.

Define whether replay consumes rate-limit points and generates an audit record. Both are policy decisions: charging every incoming request differs from charging only new business executions.

### 10.3 Event failure capture after final retry

```text
Trace → logical event Audit → DeadLetter → Resilience → event handler
```

This lets DeadLetter observe final exhaustion rather than every attempt. If `rethrow: false` swallows a captured failure, outer observers see a returned value; their metadata should distinguish “captured failure” from actual successful handler work. Nothing here makes in-memory CQRS event delivery durable.

### 10.4 Minimum private integration suite

Create a private project such as `integration/packages/` rather than adding sibling add-on dependencies to published core. It may depend on all packages for testing while the runtime package dependency graph stays independent.

| Contract | Required assertion |
|---|---|
| Auth + cache | Same correlation, different principal cannot replay protected output |
| Auth + idempotency | Replay is restricted to the intended authenticated ownership policy |
| Gate + cache | Disabling before cache blocks cached response when configured |
| Gate + retry | One logical decision is reused with recommended placement |
| Retry + dead-letter | Actual exported behaviors capture once after exhaustion |
| Retry + audit | Logical execution and per-attempt records match documented placement |
| Idempotency + finalization failure | No implicit retry of committed work |
| Trace + all short-circuits | Hit/replay/deny metadata visible on the outer span |
| Scoped providers | Handler and behaviors receive the same CQRS request context |
| Two Nest applications | Destroying one does not alter the other's wrappers/context |
| Packed CASL | Normal module construction resolves authorizer and alias token |

Use real package classes and small fake application handlers/stores. Add external backend tests only for guarantees that need the actual backend, such as PostgreSQL atomic claims and expiry. A fake retry loop cannot validate Cockatiel configuration or abort-signal behavior.

## 11. Delivery roadmap with concrete completion criteria

Each row is a reviewable change set. Avoid a single sweeping “architecture cleanup” PR.

| Sequence | Change set | Findings | Completion criteria | Compatibility |
|---:|---|---|---|---|
| 1 | Preserve compiled CASL regression coverage | F01, F17 | Packed/built Nest bootstrap test passes; alias resolves | Runtime fix already present |
| 2 | Repair protected cache partitioning and claims | F02 | Same correlation cannot cross principal/permission scope; key migration documented | New namespace/default semantics |
| 3 | Restore Zod declaration safety | F04 | Invalid output accesses fail compilation; base inference preserved | Corrective type tightening |
| 4 | Complete instrumentation error isolation | F03 | Every failure injection preserves result/error and exactly one execution | Compatible behavior hardening |
| 5 | Fix key encoding and cache ownership | F05–F07 | Collision tests and full construction ownership tests pass | Key migration plus diagnostics correction |
| 6 | Make post-success idempotency failure explicit | F12–F13 | Snapshot/store phases, conservative claim handling, database-clock integration tests | Document store/SQL migration |
| 7 | Secure opt-in payload logging defaults | F11 | Sensitive masking default; secondary metadata policy tested | Log output changes |
| 8 | Complete feature decision and telemetry bridge contracts | F15–F16 | Strict failures expose decision metadata; real short-circuit integration tests | Mostly additive |
| 9 | Tighten core async/identity/DI contracts | F08–F10 | Scope correctness, no ignored runtime fields, identity tests, compatibility matrix | Planned breaking API work |
| 10 | Repair CASL actor dispatch and unify neutral denial errors | F14, F20 | Overload type/runtime parity, HTTP filter and non-HTTP denial tests | Corrective dispatch fix plus error-class migration |
| 11 | Normalize resilience compatibility | F19 | Explicit typed legacy policy or deliberate rejection; no silent backoff fallback | Deprecation or tightening |
| 12 | Release and documentation gate | F17–F18 | All tarballs inspected, consumer installs work, quick starts compile | Packaging/docs correction |

Documentation updates should accompany each implementation, not wait entirely for row 12. Rows 2–4 deserve the earliest engineering attention because they protect isolation, correctness, and result semantics.

### Suggested command sequence for implementation work

```bash
# Build the package(s) before compiled-consumer tests.
pnpm --filter @nestjs-pipeline/core build
pnpm --filter @nestjs-pipeline/casl build

# Run only the affected package suites first.
pnpm --filter @nestjs-pipeline/casl test
pnpm --filter @nestjs-pipeline/casl lint

# For broad package API changes, verify all packages.
pnpm --filter './packages/*' --no-bail build
pnpm --filter './packages/*' --no-bail test
pnpm lint:persistence
pnpm check

# Application E2E is a separate command and needs its infrastructure.
pnpm test:e2e
```

For core public API changes, check affected DDD consumers too. A package-only build does not prove downstream application compilation. Keep runtime backend integration and a version matrix distinct from unit tests in test reports.

### Release checklist

- Every public behavior has an example that registers all required providers.
- Supported Nest/CQRS pairs are tested from packed artifacts.
- Existing metrics preserve units and semantic meaning.
- Cache/limiter namespace changes include rolling-deployment guidance.
- Error migrations include presentation filter examples.
- New core API consumers require an appropriate updated core peer range.
- Required license documents continue to exist inside every tarball; retain the new copy step.
- Source-only production notes are included in the package or merged into the published README.
- No package imports DDD application code or introduces a sibling runtime dependency for diagnostics.
- Release notes separate fixed defects, changed defaults, supported legacy forms, and continuing limitations.

## 12. Reproduction examples

The examples below exercise built packages from the repository root. Build relevant packages first. They require the repository's installed dependencies and do not contact external services.

### Cache correlation reuse

```js
const { CacheBehavior } = require('./packages/pipeline-cache/dist');
const data = new Map();
const behavior = new CacheBehavior({
  async get(key) { return data.get(key); },
  async set(key, value) { data.set(key, value); },
}, undefined, { debug() {} });

function context() {
  return {
    request: { id: 1 }, requestName: 'GetUserQuery', requestKind: 'query',
    handlerName: 'GetUserHandler', tenantId: 'tenant-a',
    correlationId: 'same-incoming-id', items: new Map(),
    getBehaviorOptions: () => undefined,
  };
}

(async () => {
  console.log(await behavior.handle(context(), async () => ({ user: 'alice' })));
  console.log(await behavior.handle(context(), async () => ({ user: 'bob' })));
  // Current default returns Alice's result twice.
})();
```

The fake contexts intentionally differ only in their unseen authenticated business result. This models handlers whose principal comes from trusted ambient context rather than payload fields. Adding a coarse guard before the cache does not make the second handler execute on a hit.

### Rate-limit tuple collision

```js
const { createPartitionedRateLimitKeyFactory } =
  require('./packages/pipeline-rate-limit/dist');
const key = createPartitionedRateLimitKeyFactory(c => c.items.get('principal'));
const context = (tenantId, principal) => ({
  tenantId, requestName: 'GetUserQuery',
  items: new Map([['principal', principal]]),
});
console.log(key(context('a:b', 'c')) === key(context('a', 'b:c')));
// Current result: true.
```

### Zod declaration regression

```ts
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const Request = createCommand(z.object({ name: z.string() }));
type IsAny<T> = 0 extends (1 & T) ? true : false;
const outputIsAny: IsAny<InstanceType<typeof Request>> = true;
const request = new Request({ name: 'valid' });
const wrongNumber: number = request.name;
request.nonexistentMethod();
```

At the reviewed version this compiled with strict checking and zero diagnostics against the built declarations. After repair, use negative type assertions so the unsafe accesses must fail, and assert `outputIsAny` is false.

### Tracing error replacement

Install a test `TracerProvider` through the package's OTel API instance. Return a tracer whose `startActiveSpan` invokes the supplied callback with a span implementing `setAttribute`, `setAttributes`, `setStatus`, and `recordException` as no-ops, but `end()` throwing a distinct error. Have `next()` throw a business error. Assert both error identity and a one-call execution count.

Observed before repair:

```text
handler executions: 1
original error preserved: false
received: span end failure
```

After repair, the original business error must reach the caller even when span termination fails. Reset the global provider after the test to avoid contaminating subsequent tests.

## 13. Final recommendation

Keep all 12 packages. Their boundaries and responsibilities are useful, and the recent feature-flag/telemetry work adds real pipeline-specific value.

Finish the remaining guarantees before expanding the package set: authenticated cache partitioning, strong emitted types, error-preserving instrumentation, unambiguous key encoding, explicit post-success failure states, and tests of compiled consumer applications. Preserve the CASL repair and use that regression as evidence for improving the test architecture.

The target is a Nest CQRS package family with precise execution contracts—not a new feature platform, telemetry framework, authorization engine, or distributed transaction system.
