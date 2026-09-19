# Claude: independent repository review — `nestjs-pipeline`

> Historical review: findings and proposed snippets describe the snapshot listed
> below, not the current API. Use canonical package READMEs and source for usage;
> current dispositions are tracked in [Telikos.Pinakas.md](Telikos.Pinakas.md).
> Documentation drift is tracked under row 35.

Reviewer: Claude (Opus 5)
Date: 2026-09-18
Commit reviewed: `ba0b57d` (`develop`, clean tree)
Method: full read of `AGENTS.md`, `.agents/skills/nestjs-pipeline-architecture/SKILL.md`, package and application source, module wiring, persistence decorators, and a full `pnpm -r test` run.

---

## Navigation

- [1. Executive assessment](#1-executive-assessment)
- [2. Verification performed](#2-verification-performed)
- [3. Decisions that should remain untouched](#3-decisions-that-should-remain-untouched)
- [4. Root causes](#4-root-causes)
- [5. Findings](#5-findings)
- [6. Status of the earlier reviews](#6-status-of-the-earlier-reviews)
- [7. Cross-package analysis](#7-cross-package-analysis)
- [8. Test architecture assessment](#8-test-architecture-assessment)
- [9. Architecture improvement blueprint](#9-architecture-improvement-blueprint)
- [10. Delivery order](#10-delivery-order)
- [11. Applied changes](#11-applied-changes)

> **Status update — 2026-09-18.** Findings **F-01**, **F-05**, **F-06** and **F-15** are
> **resolved** in the working tree, together with the five CI guardrails described under
> F-15. **F-10** was **rejected by the repository owner**: `ddd/users-api` is a showcase, and
> its illustrative event handlers stay. The rule that detects them now reports at `warn`
> severity so the trade-off stays visible without blocking the build. See
> [§11. Applied changes](#11-applied-changes) for the full record. Every other finding below
> is still open and describes the code as of commit `ba0b57d`.

Severity scale used below:

| Severity | Meaning |
|---|---|
| **S1** | Correctness or security defect reachable in a supported configuration. Fix before publishing. |
| **S2** | Architectural violation or design defect that will compound. Fix before 1.0. |
| **S3** | Real but bounded: dead code, redundant API surface, drift. |

Disposition: **Mandatory**, **Strongly recommended**, **Optional**.

---

## 1. Executive assessment

This is a genuinely competent monorepo. The pipeline abstraction is a good idea implemented with real care: behaviors are resolved once at bootstrap, singleton and request-scoped handlers are both supported, the context object is immutable to behaviors via symbol-keyed setters, and correlation/tenant propagation uses `AsyncLocalStorage` instead of parameter threading. The persistence lifecycle in `ddd/core` — version-conditioned writes, deferred acknowledgment, CAS cache writes, mutation barriers — is more rigorous than most production codebases achieve. 704 tests pass. Nothing here reads as thoughtless.

The problems are of three specific kinds, and they are consistent enough to be treated as three root causes rather than forty independent bugs.

**First, the repository violates its own documented rules in the reference application.** `AGENTS.md` rule 2 and `SKILL.md` rule 4 forbid Nest HTTP exceptions in domain, application, and behavior code — `CaslBehavior` throws `ForbiddenException` twice. `SKILL.md` forbids event handlers that only log — four of them exist. `SKILL.md` forbids manual try/catch constraint mapping in repositories — `DeleteUserCommandRepository` does exactly that. `AGENTS.md` rule 5 forbids silently collapsing missing tenant context into a shared namespace — `filterCacheKey` does so for every environment that is not `NODE_ENV=production`. The rules are correct; the enforcement is missing. A rule that only exists in Markdown is a rule the codebase will drift away from, and it already has.

**Second, "backward compatibility" is being paid for before any version exists to be compatible with.** Nine of the eleven behavior packages are at `0.1.0`–`0.1.9`, unpublished and versioned as a set. Yet the code carries deprecated aliases (`markPersisted`, `createZodCommand`, `ZOD_SCHEMA`, `CaslEntityAuthorizer`, `RESILIENCE_ABORT_SIGNAL_ITEM`, `PIPELINE_OPTIONS_REGISTRY`), legacy overload branches with runtime type sniffing, a legacy string form of `RetryBackoff`, and — most consequentially — **defaults chosen for compatibility rather than correctness**. `LoggingBehavior.redactSensitiveKeys` defaults to `false` explicitly so that "upgrading the package does not alter existing log payloads". `RateLimitBehavior` keeps a global per-request-name bucket "so upgrading this package remains backward-compatible". There are no upgraders. This reasoning has produced an insecure logging default and a rate limiter whose default configuration is a shared-fate bucket.

**Third, one flagship package is inert and nobody noticed, because the reference application never uses it.** `CacheBehavior`'s default key includes `context.correlationId`, which is unique per request. The default cache therefore writes every query result to Redis and can never read one back. `packages/pipeline-cache/src/helpers/cache-key.spec.ts:107` asserts that two correlation IDs produce different keys — the test locks the behavior in as intended. The reference app imports `CacheModule` but never attaches `CacheBehavior` to a handler (`ReliabilityModule` even documents why: caching lives at the repository boundary instead). So the only integration evidence for the package is a unit test with a mock cache and a hand-written key. This is the single clearest instance in the repository of tests producing confidence without producing coverage.

None of this is fatal. The architecture is sound and the fixes are mostly local. But the repository is currently in a state where the documentation is more advanced than the enforcement, and the test suite is more voluminous than it is probing.

**Verdict:** strong foundation, not yet publishable. Six S1 items gate a 1.0.

---

## 2. Verification performed

```
pnpm -r --no-bail test     → exit 0
  packages/pipeline-zod         10 files / 83 tests
  packages/pipeline-resilience   4 files / 35 tests
  ddd/core                      19 files / 177 tests
  ddd/users-api                 78 files / 409 tests
  (remaining packages passed; summaries interleaved in output)
```

Static survey: 539 TypeScript files, ~57,400 lines outside `dist/` and `node_modules/`. 326 KB of Markdown across 15 README/PRODUCTION files.

Not verified: the e2e suite (`pnpm test:e2e`) was not run — it requires Redis and Postgres. Findings that touch e2e behavior are marked as reasoned from source, not observed.

---

## 3. Decisions that should remain untouched

I want to be explicit about these, because several are unusual enough to attract a reviewer's reflex objection and all of them are right.

**Deliberate `@nestjs/cqrs` coupling in `@nestjs-pipeline/core`.** The package's entire value is that it hooks Nest's CQRS buses without asking the developer to change how they dispatch. An abstract mediator would relocate the coupling to the consumer, not remove it. Keep it. The `ExplorerService` import from `@nestjs/cqrs/dist/services/explorer.service` is a real risk, but a bounded, documented, tested one (`cqrs-discovery-without-private-metadata.e2e-spec.ts`). Keep it with the existing compatibility discipline.

**Bootstrap-time method patching over per-request reflection.** `PipelineBootstrapService` precomputes handler metadata, behavior order, and singleton instances once, then captures them in a closure. The all-singleton path allocates nothing per request. This is the correct trade for a hot path.

**Symbol-keyed context setters.** `SET_RESPONSE`, `SET_TENANT_ID`, `SET_CORRELATION_ID` as module-private unique symbols give genuine write protection without `Object.freeze` or a proxy. Good design.

**Separate packages per cross-cutting concern.** Eleven small packages with independent peer dependencies means a consumer who wants correlation IDs does not install `cockatiel`, `@casl/ability`, and `@openfeature/server-sdk`. The boundaries are real.

**Authorization after cache hydration.** `CaslBehavior` does request-shape checks; `CaslAuthorizer` re-checks the loaded aggregate. Splitting these is correct and the `SKILL.md` rationale is right.

**`@FromCache` returning strictly domain aggregates.** Forcing `alwaysHydrate: true` + `hydrateFn` and eliminating `User | UserSnapshot` union returns from query repositories was the right call. Do not revert it.

**No transactional outbox.** `CommandBaseHandler.commit()` documents honestly that the in-memory `EventBus` gives no durability guarantee. Adding an outbox because DDD literature recommends one would be cargo-culting. Keep the honest limitation.

**Write-side aggregate hydration.** `IWriteSideAggregateRepository<TEntity>` returning `Promise<TEntity | null>` from primary storage with `{ refresh: true }`, so command handlers never see snapshots, is a clean resolution of a problem earlier reviews raised. Keep it.

---

## 4. Root causes

Most findings below trace to one of four causes. Fixing the cause is cheaper than fixing the symptoms.

**RC-1 — Architecture rules are documented but not enforced.** `AGENTS.md` and `SKILL.md` state seventeen non-negotiable rules. Exactly one family of them is machine-checked (`biome/plugins/persistence-lifecycle.grit`). Everything else relies on reviewer memory. Symptoms: F-01, F-06, F-09, F-10, F-14, F-15.

**RC-2 — Pre-emptive backward compatibility on unreleased packages.** Symptoms: F-03, F-05, F-11, F-12, F-16, F-17.

**RC-3 — Optional, best-effort failure handling applied to mechanisms whose failure is a correctness event.** `@Cache` swallows every error including failure to install an anti-resurrection barrier; `CacheBehavior` and `RateLimitBehavior` default to fail-open. Some of these are right (a cache write failing should not fail a committed transaction); some are not (a barrier failing to install silently re-enables the exact race the barrier exists to prevent). Symptoms: F-04, F-07.

**RC-4 — Overloaded APIs resolved by runtime shape sniffing.** `CaslAuthorizer.authorize/filter/can`, the `CaslAuthorizer` constructor, `@Cache`, `@FromCache`, `PipelineModule.forRoot`. Each accepts two to four call shapes and picks one by inspecting `args.length` and `typeof args[n]`. This makes the compiler stop being the contract. Symptoms: F-02, F-13.

---

## 5. Findings

### ~~F-01 — `CaslBehavior` throws `ForbiddenException` from a reusable library~~ — **S1**, Mandatory

> **Fixed 2026-09-18.** Both throw sites now raise `UnauthorizedActionException`; `ReliabilityModule` no longer compensates in `ignoreErrors`; a regression test asserts the error is not an `HttpException`. See [§11.3](#113-f-01--casl-denials-are-transport-neutral).

| | |
|---|---|
| Category | Architectural boundary / framework leak |
| Package | `@nestjs-pipeline/casl` |
| Files | `packages/pipeline-casl/src/casl.behavior.ts:510`, `:697` |
| Also affects | `ddd/users-api/src/infrastructure/reliability.module.ts:76` |

**Current behavior.** The behavior imports `ForbiddenException` from `@nestjs/common` and throws it for both "no user context" and "requirement failed". The same package already ships `UnauthorizedActionException` (`src/exceptions/unauthorized-action.exception.ts`), a plain `Error` subclass, which `CaslAuthorizer` uses for the identical semantic outcome. The application ships `UnauthorizedActionFilter` to map it. So the package has two denial error families with different transport semantics.

**Why it matters.** This is worse in a library than in an application. `@nestjs-pipeline/casl` declares `@nestjs/common ^10 || ^11` as a peer and nothing about HTTP. A consumer running the pipeline over a microservice transport, a BullMQ worker, or a CLI gets an object carrying `getStatus() === 403` that their transport does not understand. It violates `AGENTS.md` rule 2, `SKILL.md` rule 4, and the package's own anti-pattern list.

The concrete cost is visible in the reference app. Because authorization denials surface as `ForbiddenException`, `ReliabilityModule` must add `ForbiddenException` to `DeadLetterModule`'s `ignoreErrors` list — otherwise every 403 would be dead-lettered as an infrastructure failure. The application is paying to undo the library's leak.

**Proposed solution.**

```ts
// packages/pipeline-casl/src/casl.behavior.ts
import { UnauthorizedActionException } from './exceptions/unauthorized-action.exception';

// line 510 — missing principal
throw new UnauthorizedActionException({
  action: requirements[0]?.action ?? 'unknown',
  subject: requirements[0]?.subject ?? 'unknown',
  reason: 'Access denied — authentication required.',
});

// line 697 — requirement failure
throw new UnauthorizedActionException({
  action: req.action,
  subject: req.subject,
  ...(req.field ? { fields: [req.field] } : {}),
  reason: 'Access denied — insufficient permissions.',
});
```

Then remove `@nestjs/common`'s `ForbiddenException` import entirely, and in the application swap `ForbiddenException` for `UnauthorizedActionException` in `ReliabilityModule`'s `ignoreErrors`.

**Migration.** `UnauthorizedActionFilter` already exists and already returns 403. Add an explicit test that a denial from `CaslBehavior` (not just from `CaslAuthorizer`) reaches the filter and produces 403 with the same body shape. `ddd/users-api/test/users.e2e-spec.ts` and `roles.e2e-spec.ts` assert on 403 responses and should keep passing unchanged.

**Risk.** Low. One error type replaces another and the filter already covers it. The only externally visible change is that a consumer who was catching `ForbiddenException` directly must catch `UnauthorizedActionException`. There are no such consumers yet.

**Tests to add.** `casl.behavior.spec.ts`: assert the thrown error is not an `HttpException` (`expect(err).not.toBeInstanceOf(HttpException)`). This is the assertion that keeps the fix from regressing.

---

### F-02 — `CaslAuthorizer` overload dispatch silently misinterprets a valid documented call — **S1**, Mandatory

| | |
|---|---|
| Category | API design / security-relevant correctness |
| Package | `@nestjs-pipeline/casl` |
| File | `packages/pipeline-casl/src/helpers/entity-authorization.helper.ts:167-211` |

**Current behavior.** `authorize()` declares three overloads and implements them as `authorize<T>(...args: unknown[])`, branching on:

```ts
const isActorOrAbilitySignature =
  args.length >= 4 ||
  (args.length === 3 && typeof args[0] !== 'string' && typeof args[1] === 'string');
```

The third declared overload is `authorize(actor: CaslUserContext | string, action, subject, fields?)` with `fields` optional. So `authorize('user-1', 'read', entity)` is a call the type signature accepts. At runtime `args.length === 3` and `typeof args[0] === 'string'`, so `isActorOrAbilitySignature` is **false**, and the call is destructured as `(action='user-1', subject='read', fields=entity)`.

**Failure scenario.** A developer writes `authorizer.authorize(actorId, 'read', user)` — accepted by TypeScript, matching the documented overload. At runtime CASL is asked whether the ambient ability permits action `"user-1"` on subject string `"read"`. No rule grants that, so it throws `UnauthorizedActionException` with `action: 'user-1'`. The failure is a confusing denial rather than a crash, so it will be diagnosed as a permissions-configuration problem, not a call-shape problem.

**Compounding issue.** Even when the actor-first form is parsed correctly (4 args), the actor is **discarded** — the code falls through to `this.ability ?? getCaslAbility()`. So `authorize(someOtherUser, 'delete', record)` authorizes as the *ambient request principal*, not as `someOtherUser`. The JSDoc says so, but the signature reads as "authorize as this actor". For an authorization primitive, a signature that reads backwards from what it does is a security hazard, not a style issue.

**Proposed solution.** Delete the actor-first overload. It cannot be implemented (the package cannot turn an actor into an ability without application role data — the JSDoc admits this) and it cannot be safely dispatched.

```ts
// Keep exactly two forms, distinguished by arity, both statically checkable:
authorize<T>(action: string, subject: object | string, fields?: string[]): T;
authorize<T>(ability: AppAbility | CaslBypassContext, action: string, subject: object | string, fields?: string[]): T;
```

and implement with a single discriminator that cannot misfire:

```ts
authorize<T>(...args: unknown[]): T {
  const abilityFirst =
    typeof args[0] === 'object' && args[0] !== null &&
    (typeof (args[0] as AppAbility).can === 'function' ||
     (args[0] as CaslBypassContext).bypass === true);
  // ...
}
```

Apply the same treatment to `filter()` (`:298`) and `can()` (`:359`), both of which use the same arity/typeof heuristic.

**Dependencies affected.** `IEntityAuthorizer` (`src/interfaces/entity-authorizer.interface.ts`) declares the legacy 4-arg `can`; narrow it in the same change. Call sites in the reference app (`create-user.handler.ts:76`, `update-user.handler.ts:48`, `delete-user.handler.ts:89`, `get-user.handler.ts:34`, `get-users.handler.ts:32`) all use the short form and need no change.

**Risk.** Low. This is a compile-time-breaking change to an unpublished package that removes a form nothing uses.

**Tests to add.** `entity-authorization.helper.spec.ts`: a type-level test (`@ts-expect-error`) proving the actor-first form no longer compiles, plus a runtime test that `authorize('read', entity)` and `authorize(ability, 'read', entity)` dispatch to the intended branch.

---

### F-03 — The default cache key guarantees a 0% hit rate — **S1**, Mandatory

| | |
|---|---|
| Category | Feature is inert / cost without benefit |
| Package | `@nestjs-pipeline/cache` |
| Files | `packages/pipeline-cache/src/helpers/cache-key.ts:37-44`, `src/cache.behavior.ts:106` |

**Current behavior.**

```ts
return `cache:v2:${tenantPrefix}${context.correlationId}:${context.requestName}:${digest}`;
```

`context.correlationId` is either inherited from a parent pipeline (nested dispatch within one request) or generated per request via `correlationIdFactory` / `uuidv7()`. Two identical queries issued by the same user in two HTTP requests therefore produce two different keys.

**Consequence.** With the default key, `CacheBehavior`:

1. computes a SHA-256 of the request on every query,
2. performs a Redis/Keyv `GET` that always misses,
3. executes the handler,
4. performs a `SET` that no read will ever consume,
5. sets `CACHE_HIT_ITEM` to `false`, always.

Net effect: two extra network round-trips per query, unbounded write growth in the cache store until TTL expiry, and zero latency benefit. The only value delivered is intra-request memoization of a repeated nested dispatch, which is a narrow case and is not what the README advertises.

**Why the current design exists.** The JSDoc explains it: an earlier default was tenant-scoped, which let one principal's authorized response be replayed to another. Scoping to `correlationId` closed that hole. That was the right instinct and the wrong remedy — it made the feature safe by making it do nothing.

**Why it went unnoticed.** Two reinforcing reasons, and both are worth fixing independently of the key itself:

- `packages/pipeline-cache/src/helpers/cache-key.spec.ts:107` asserts `defaultCacheKey(ctx({correlationId:'request-a'})) !== defaultCacheKey(ctx({correlationId:'request-b'}))`. The test encodes the never-hit property as a requirement.
- `CacheBehavior` is never attached to a handler anywhere in `ddd/users-api`. Grep confirms the only references outside the package are in `test/behaviors.spec.ts`, which constructs it with a mock cache and an explicit key. `ReliabilityModule:93-96` documents that repository-level `@FromCache` is used instead. The package has **no end-to-end exercise at all**.

**Proposed solution — fail loudly instead of failing silently.** Remove `defaultCacheKey` as an implicit default and require an explicit key:

```ts
// cache.behavior.ts
const keyFactory = options.key;
if (!keyFactory) {
  throw new TypeError(
    `CacheBehavior on ${context.handlerName} requires an explicit \`key\` factory. ` +
    `The cache key must include every dimension that can change the authorized response ` +
    `(tenant, principal, permission scope, request payload). ` +
    `Use createPartitionedCacheKeyFactory(...) for the common case.`,
  );
}
```

and ship the safe composition as an explicit, named helper mirroring the shape `pipeline-rate-limit` already uses for exactly this problem:

```ts
// packages/pipeline-cache/src/helpers/partitioned-key.ts   (new)
export interface PartitionedCacheKeyOptions {
  /** Resolves the principal identity the response is scoped to. */
  principal: (ctx: IPipelineContext) => string | undefined;
  /** Resolves a permission-scope fingerprint (role-set hash, capability version). */
  scope?: (ctx: IPipelineContext) => string | undefined;
  /** @default true — fail closed when tenant context is required but absent. */
  requireTenant?: boolean;
}

export function createPartitionedCacheKeyFactory(
  options: PartitionedCacheKeyOptions,
): CacheKeyFactory {
  return (ctx) => {
    const tenant = ctx.tenantId;
    if (options.requireTenant !== false && !tenant) {
      throw new MissingTenantContextError(ctx.requestName);
    }
    const principal = options.principal(ctx)?.trim();
    if (!principal) throw new TypeError(/* ... */);
    const scope = options.scope?.(ctx) ?? 'noscope';
    const digest = createHash('sha256').update(stableStringify(ctx.request)).digest('hex');
    return ['cache', 'v3', tenant ?? '_', principal, scope, ctx.requestName, digest]
      .map(escapeSegment)   // see F-05 — share one escaper across packages
      .join(':');
  };
}
```

A throw at first invocation is strictly better than a silent no-op: it is discovered in the first integration test rather than in a production cost review.

**Migration.** No consumers exist. Bump the key prefix to `v3` for the helper. Update `packages/pipeline-cache/README.md`, which currently presents `defaultCacheKey` as a usable default.

**Tests to add / change.**
- Delete or invert `cache-key.spec.ts:107`; assert instead that two requests from the same principal with the same payload produce the **same** key and that two different principals produce different keys.
- Add a `ddd/users-api` e2e test that attaches `CacheBehavior` with a partitioned key to `GetUsersQuery`, issues the same query twice as the same principal, asserts one DB round-trip and `CACHE_HIT_ITEM === true` on the second, then issues it as a second principal with narrower permissions and asserts a miss.

Without that last test the package remains unverified regardless of the key fix.

---

### F-04 — Cache mutation barriers protect readers but not writers — **S1**, Mandatory

| | |
|---|---|
| Category | Concurrency / cache correctness |
| Package | `@nestjs-pipeline/ddd-core` |
| Files | `ddd/core/persistence/helpers/cache-version.helper.ts:28-38`, `ddd/core/persistence/decorators/Cache.ts:190-213` |

**Current design.** On deletion or secondary invalidation, `@Cache` writes a `CacheMutationBarrier` sentinel to the affected keys. `@FromCache` checks for a barrier before and after its DB read and refuses to repopulate the cache when one appeared mid-flight. `AGENTS.md` rule 17 presents this as the anti-resurrection guarantee.

**The gap.** `isCacheNewer` returns `false` when either operand is a barrier:

```ts
if (/* ... */ isCacheMutationBarrier(cached) || isCacheMutationBarrier(incoming)) {
  return false;
}
```

`@Cache`'s write-through path calls `this.cache.set(setKey, snapshot, { ttl, isNewer })`. The adapter skips the write only when `isNewer(existing, incoming)` is true. Since a barrier makes it false, **a write-through unconditionally overwrites a barrier**.

**Failure scenario.**

1. Request A: `UpdateUserCommand` for user `u`. Handler loads `u` at version 4, mutates to 5, calls `save()`. The DB `UPDATE` commits.
2. Request B: `DeleteUserCommand` for `u`. Loads `u`, deletes, `save()` returns `null`. `@Cache` installs a `deleted` barrier on `user:id:u` and `user:email:...`.
3. Request A's `@Cache` write-through — which runs after its DB write but is scheduled later — resolves `setKey`, serializes the version-5 snapshot, and calls `cache.set`. `isCacheNewer(barrier, snapshot)` is `false`, so the write proceeds.
4. `user:id:u` now holds a live snapshot of a row that no longer exists.
5. Every subsequent `@FromCache` read sees a normal snapshot cache hit (`FromCache.ts:171`) and returns a hydrated `User` for a deleted user, until TTL expiry. If `resolvedTtl` is undefined, `MemoryCache` applies its 60 s default; a Redis-backed adapter may apply none.

The reader-side machinery never engages because from the reader's perspective this is an ordinary cache hit.

**Why this is not hypothetical.** The window is the interval between the delete's barrier install and the update's write-through — i.e. the duration of the update's own `@AcknowledgePersisted` and cache-serialization work. That is short but non-zero, and the repository has already invested heavily in defending against exactly this class of race for readers.

**Proposed solution.** Make the barrier authoritative against all writers, not just against readers. Two changes:

1. **Barriers win over snapshots in the CAS comparison.**

```ts
// cache-version.helper.ts
export function isCacheNewer(cached: unknown, incoming: unknown): boolean {
  // A barrier represents a mutation that has already been durably applied.
  // A plain snapshot must never overwrite it; only a newer barrier may.
  if (isCacheMutationBarrier(cached)) {
    return !isCacheMutationBarrier(incoming) ||
      (incoming.createdAt ?? 0) <= cached.createdAt;
  }
  if (isCacheMutationBarrier(incoming)) return false;
  // ... existing version / __gen / updatedAt comparison
}
```

With this, step 3 above becomes a no-op: the barrier survives, the next read sees it, does an authoritative DB read, finds nothing, and returns `null` without repopulating.

2. **Give barriers a real, bounded lifetime.** `@Cache` currently installs them with `{ ttl: 0 }`, and `MemoryCache.set` treats `ttl <= 0` as *never expires* (`memory.cache.ts:60`). Combined with `MemoryCache`'s unbounded `Map` and absent eviction, every deleted aggregate leaves a permanent key. Introduce an explicit `barrierTtl` (default: the larger of the entity TTL and a floor of ~30 s — long enough to outlive any in-flight write, short enough to bound growth) and pass it explicitly rather than relying on the `0` sentinel.

**Dependencies affected.** `ddd/core/persistence/cache/memory.cache.ts`, `ddd/users-api/src/persistence/cache/mikro-orm.cache.ts` (verify its `ttl: 0` and CAS-delete semantics match), `ddd/core/persistence/decorators/Cache.ts`.

**API changes.** Additive `barrierTtl?: number` on `CacheOptions`. `isCacheNewer`'s behavior changes for barrier operands; it is exported from `@nestjs-pipeline/ddd-core`, but no consumer outside the repo exists.

**Tests to add.** `ddd/core/persistence/decorators/Cache.spec.ts`: install a barrier, then attempt a write-through with a higher-version snapshot, assert the barrier survives. `ddd/users-api/test/cache-stale-resurrection.e2e-spec.ts` already covers the reader side — add the writer side: interleave a delete and a slower update on the same aggregate and assert the post-delete read returns `null`.

**Risk.** Medium. It changes which writes are accepted under contention. The existing e2e concurrency suite (`cache-concurrency`, `cache-write-through-cas`, `cache-stale-resurrection`) should be run before and after.

---

### ~~F-05 — `filterCacheKey` silently merges tenants outside production~~ — **S1**, Mandatory

> **Fixed 2026-09-18.** Fails closed in every environment with `MissingTenantContextError`; the `NODE_ENV` gate and the module-load `process.env` read are gone. See [§11.4](#114-f-05--tenant-resolution-fails-closed-in-every-environment).

| | |
|---|---|
| Category | Multi-tenant isolation |
| Package | `@nestjs-pipeline/ddd-core` |
| File | `ddd/core/persistence/helpers/filter-cache-key.helper.ts:139`, `:178-196` |

**Current behavior.**

```ts
export const DEFAULT_TENANT_SCHEMA = process.env.DB_DEFAULT_SCHEMA || 'tenant';

function resolveTenantSchema(tenantOrContext?: string | IPipelineContext): string {
  let schema = /* explicit ?? context.tenantId ?? pipelineStore.getStore()?.tenantId */;
  if (!schema) {
    if (process.env.NODE_ENV === 'production') throw new Error('Missing tenant context: ...');
    schema = DEFAULT_TENANT_SCHEMA;
  }
  return schema;
}
```

**Why this is wrong.** `AGENTS.md` rule 5: *"Fail closed when required security context is absent; never silently fall back to shared `'default'` namespaces."* `SKILL.md` rule 8 repeats it and names the required error: `MissingTenantContextError`. The anti-pattern list says: *"Defaulting missing tenant context to `'default'` instead of failing closed."*

This code implements the banned pattern, with two mitigations that do not hold:

- The namespace is `'tenant'` rather than `'default'`. The name does not change the behavior.
- The fallback is gated on `NODE_ENV === 'production'`. That gate fails open in every environment where `NODE_ENV` is unset, `'staging'`, `'test'`, or `'development'`. Staging environments routinely hold real tenant data. A container that forgets to set `NODE_ENV` is a production deployment with the safety check disabled.

Secondarily, `process.env.DB_DEFAULT_SCHEMA` is read **at module load** inside the shared DDD core. `SKILL.md` rule 10 puts environment access in bootstrap and infrastructure modules, not in a core cache-key helper — and module-load-time reads cannot be overridden by any later configuration.

**Proposed solution.** Fail closed unconditionally, and make the single-tenant case explicit rather than implicit:

```ts
// ddd/core/domain/exceptions/missing-tenant-context.exception.ts   (new)
export class MissingTenantContextError extends DomainException {
  constructor(readonly operation: string) {
    super(`Missing tenant context: cannot derive a cache key for ${operation}.`);
  }
}

// filter-cache-key.helper.ts
function resolveTenantSchema(tenantOrContext?: string | IPipelineContext): string {
  const schema = typeof tenantOrContext === 'string'
    ? tenantOrContext
    : (tenantOrContext?.tenantId ?? pipelineStore.getStore()?.tenantId);
  if (!schema) throw new MissingTenantContextError('cache key derivation');
  return schema;
}
```

Applications that are genuinely single-tenant pass the constant explicitly — `filterCacheKey(User, { id }, 'single')` — or configure `PipelineModule.tenantIdFactory: () => 'single'`, which is the designed extension point and makes the decision visible in the composition root.

**Migration.** Tests and local development that relied on the fallback must set the tenant. The reference app already configures `tenantIdFactory: () => tenantContext.schema` (`observability.module.ts:106`), so production paths are covered. `ddd/users-api/test/support/e2e-app.ts` will need an explicit tenant in any fixture that currently relies on the default.

**Tests to add.** `filter-cache-key.helper.spec.ts`: assert `MissingTenantContextError` is thrown with `NODE_ENV` unset, `'test'`, `'development'`, and `'staging'`. The current suite almost certainly asserts the fallback — that assertion must be inverted.

**Risk.** Medium in test churn, low in production behavior. Worth it: this is the rule the repository considers non-negotiable.

---

### ~~F-06 — `@nestjs-pipeline/correlation` depends on core instead of peering it~~ — **S1**, Mandatory

> **Fixed 2026-09-18.** Core moved to `peerDependencies`; `scripts/check-package-boundaries.mjs` now guards the invariant repository-wide. The `Symbol.for` hardening under *Additional hardening* remains open. See [§11.1](#111-f-06--core-is-now-a-peer-dependency-everywhere).

| | |
|---|---|
| Category | Packaging / cross-package coupling |
| Package | `@nestjs-pipeline/correlation` |
| File | `packages/pipeline-correlation/package.json` |

**Current state.** Every behavior package declares `"@nestjs-pipeline/core": "^0.1.19"` under `peerDependencies`. `pipeline-correlation` alone declares it under `dependencies` as `"workspace:*"`, and does **not** list it as a peer.

**Why it matters.** `@nestjs-pipeline/core` is stateful in ways that require a single instance per process:

- `pipelineStore` is a module-scoped `AsyncLocalStorage` (`constants/pipeline-context.constants.ts:16`).
- `SET_RESPONSE`, `SET_TENANT_ID`, `SET_CORRELATION_ID`, `PIPELINE_TENANT_ID` are `Symbol(...)`, not `Symbol.for(...)`, so two module instances produce non-equal symbols.
- `PIPELINE_BEHAVIOR_ID` and `getBehaviorId()` identity depends on the same module instance.

On publish, `workspace:*` resolves to a pinned version. A consumer on `@nestjs-pipeline/core@0.1.20` who installs `@nestjs-pipeline/correlation@0.1.9` can end up with `node_modules/@nestjs-pipeline/correlation/node_modules/@nestjs-pipeline/core@0.1.19` — a second copy. Then:

- `getCorrelationId()` reads copy B's `pipelineStore`, which the bootstrap service (running in copy A) never populated → correlation IDs silently revert to whatever the correlation middleware set, or to `undefined` inside event handlers.
- `context[SET_TENANT_ID]` from copy A is invisible to code holding copy B's symbol.

The failure is silent — no crash, no type error, just correlation and tenant context quietly disappearing in some code paths. This is the hardest class of bug to diagnose in production, and it is created by one line in a manifest.

The comment in `packages/pipeline-correlation/src/helpers/uuidv7.ts` — *"Canonical UUIDv7 implementation shared with `@nestjs-pipeline/core`"*, followed by `export { uuidv7 } from '@nestjs-pipeline/core'` — shows the dependency is deliberate and cross-cutting, which makes it exactly the kind that must be a peer.

**Proposed solution.**

```jsonc
// packages/pipeline-correlation/package.json
{
  "peerDependencies": {
    "@nestjs-pipeline/core": "^0.1.19",
    "@nestjs/common": "^10.0.0 || ^11.0.0"
  },
  "devDependencies": {
    "@nestjs-pipeline/core": "workspace:*"
  }
}
```

**Additional hardening (Strongly recommended).** Make a duplicated core detectable rather than silent:

```ts
// packages/pipeline/src/constants/pipeline-context.constants.ts
const GLOBAL_KEY = Symbol.for('@nestjs-pipeline/core:pipelineStore');
const g = globalThis as Record<symbol, unknown>;
export const pipelineStore =
  (g[GLOBAL_KEY] as AsyncLocalStorage<IPipelineContext>) ??
  (g[GLOBAL_KEY] = new AsyncLocalStorage<IPipelineContext>());
```

and switch the cross-package symbols (`SET_*`, `PIPELINE_TENANT_ID`, `PIPELINE_BEHAVIOR_ID`, `CASL_ABILITY_KEY`) to `Symbol.for(...)` with namespaced strings. This makes two copies of core interoperate instead of silently diverging.

**Tests to add.** A repository-level check — a small script in `pnpm check`, or a fifth Grit plugin — asserting that every `packages/*/package.json` declares `@nestjs-pipeline/core` in `peerDependencies` and never in `dependencies`. This is cheap and prevents recurrence.

**Risk.** None functionally inside the workspace (pnpm hoists the workspace version either way). It only changes published resolution, which is the point.

---

### F-07 — Domain event publication is controlled by the handler's return shape — **S2**, Mandatory

| | |
|---|---|
| Category | Implicit contract / DDD correctness |
| Package | `@nestjs-pipeline/ddd-core` |
| File | `ddd/core/application/command-base.handler.ts:113-129` |

**Current design.** `execute()` publishes buffered events only when the handler's return value `instanceof AggregateRoot`, or is an object with an `aggregate` property that is. Otherwise events stay buffered on a discarded aggregate and are lost silently.

**Failure scenario.** A developer adds a command handler that persists an aggregate and returns a response DTO — the most natural thing to do, and what most Nest codebases do:

```ts
async handle(cmd: ArchiveUserCommand): Promise<{ archivedAt: Date }> {
  const user = await this.repo.findById(cmd.id);
  user.archive();                     // applies UserArchivedEvent
  await this.repo.save(user);
  return { archivedAt: user.updatedAt };   // ← events silently dropped
}
```

No error, no warning, no failing test unless someone thought to assert on the event. Downstream handlers simply never run. The `SKILL.md` documents the requirement, but documentation cannot catch this at the call site and the type system does not either: `CommandBaseHandler<TCommand, TResult>` accepts any `TResult`.

**Proposed solution — make the contract explicit in the type, and make the silent case loud.**

Step 1 (non-breaking, ships immediately): detect and report the dropped-events case.

```ts
async execute(command: ICommand): Promise<TResult> {
  const result = await this.handle(command as TCommand);
  const aggregate = CommandBaseHandler.extractAggregate(result);
  if (aggregate) {
    this.commit(aggregate);
    return result;
  }
  // No aggregate in the result. If the handler mutated one, its events are
  // stranded — surface it instead of losing it.
  if (this.pendingAggregates.size > 0) {
    throw new UnpublishedDomainEventsError(this.constructor.name, [...this.pendingAggregates]);
  }
  return result;
}
```

Tracking `pendingAggregates` requires the repository to report what it saved. `ICommandRepository.save()` already receives the aggregate; have `CommandRepository` record it on an ambient per-request set (the pipeline store is already available). That is a real change and should be scoped carefully.

Step 2 (the cleaner target): make the aggregate a first-class part of the result contract rather than something discovered by inspection.

```ts
export type CommandOutcome<TPayload = void> = {
  readonly aggregate: AggregateRoot;
  readonly payload: TPayload;
};

export abstract class CommandBaseHandler<TCommand extends ICommand, TPayload = void> {
  abstract handle(command: TCommand): Promise<CommandOutcome<TPayload>>;

  async execute(command: ICommand): Promise<TPayload> {
    const outcome = await this.handle(command as TCommand);
    this.commit(outcome.aggregate);
    return outcome.payload;
  }
}
```

Now the compiler enforces it: a handler that forgets the aggregate does not type-check. The `SKILL.md` anti-pattern list currently bans "legacy `DomainOutcome` wrappers" — that ban was about aggregates *not* managing their own events, which is a different concern and remains satisfied here (`this.apply(event)` is unchanged). This wrapper carries the aggregate to the publisher; it does not carry the events.

**Migration.** Five command handlers in `ddd/users-api` (`create-user`, `update-user`, `delete-user`, `create-auth`, `delete-auth`, plus the three role handlers) change their return statement from `return user` to `return { aggregate: user, payload: user }`. Controllers change from reading the aggregate to reading `payload`. Mechanical, and `command-base.handler.spec.ts` already covers the lifecycle.

**Risk.** Step 1 is medium risk (it can throw on a path that previously succeeded silently — which is the point, but it needs a rollout). Step 2 is low risk but touches every handler. Ship step 2 before 1.0; step 1 only if step 2 is deferred.

---

### F-08 — Resilience binds telemetry context to the first request a handler ever sees — **S2**, Strongly recommended

| | |
|---|---|
| Category | Observability correctness |
| Package | `@nestjs-pipeline/resilience` |
| File | `packages/pipeline-resilience/src/resilience.behavior.ts:100-120` |

**Current behavior.** `resolvePolicy` caches by `context.handlerType` and builds `PolicyBuildContext` from the *first* context seen:

```ts
const policy = buildResiliencePolicy(effective, {
  logger: this.logger,
  requestName: context.requestName,     // captured once, forever
  handlerName: context.handlerName,
});
```

Cockatiel's `onRetry`, `onBreak`, `onTimeout` and `onReject` callbacks close over that string. Caching the policy is correct — circuit breakers and bulkheads must be stateful per handler. Baking the request name into it is not.

**Failure scenario.** An event handler registered for multiple event types (`@EventsHandler(OrderPlacedEvent, OrderCancelledEvent)`) with a retry policy. Whichever event arrives first wins. Every subsequent retry log and telemetry callback reports that first event's name, regardless of what actually failed. Operators chasing a retry storm are pointed at the wrong event type.

**Proposed solution.** Separate the stateful policy (per handler, cached) from the per-invocation labels (per request, not cached). Cockatiel passes a context to `execute`; carry the labels through it or through the existing attempt `AsyncLocalStorage`:

```ts
// resilience-context.ts — extend the existing attempt store
interface ResilienceAttempt {
  readonly signal: AbortSignal;
  readonly requestName: string;
  readonly handlerName: string;
}
const attemptStore = new AsyncLocalStorage<ResilienceAttempt>();

// policy-factory.ts — read labels at emit time, not build time
policy.onRetry((event) => {
  const a = attemptStore.getStore();
  ctx.logger?.debug?.(
    `[resilience] retrying ${a?.requestName ?? '<unknown>'} → ${a?.handlerName ?? ctx.handlerName} ` +
    `(attempt ${event.attempt}, delay ${event.delay}ms)`,
    LOG_CONTEXT,
  );
  ctx.telemetry?.onRetry?.({ attempt: event.attempt, delay: event.delay, requestName: a?.requestName });
});
```

`PolicyBuildContext` then carries only handler-stable data (`handlerName`, `logger`, `telemetry`).

**Note on `onRetry` and async context.** Cockatiel invokes `onRetry` from within the policy's own execution, so the attempt store established by `runWithResilienceAbortSignal` is in scope. Verify this in a test rather than assuming it — if it is not, pass labels through Cockatiel's policy context instead.

**Tests to add.** `resilience.behavior.spec.ts`: one handler, two distinct request types, both failing; assert the retry telemetry reports each type correctly.

---

### F-09 — Retry wraps audit in the reference application, multiplying audit records — **S2**, Strongly recommended

| | |
|---|---|
| Category | Behavior ordering / compliance correctness |
| Package | `ddd/users-api` (reference application) |
| File | `ddd/users-api/src/users/cqrs/commands/delete-user.handler.ts:25-63` |

**Current behavior.** The `@UsePipeline` list is, in order: `LoggingBehavior`, `CaslBehavior`, `ResilienceBehavior` (retry, `maxAttempts: 3`), `AuditBehavior`. Behaviors execute left-to-right outermost-first, so `AuditBehavior` sits **inside** the retry.

`AuditBehavior.handle` writes one record per invocation — on the success path (`audit.behavior.ts:157`) and on the failure path (`:123`). A delete that fails twice with a transient error and succeeds on the third attempt therefore produces **three** audit records for one logical operation: two `failed: true`, one `failed: false`.

**Why it matters.** `AUDIT_ACTIONS.USER_DELETE` at `AUDIT_SEVERITY.HIGH` is precisely the kind of record that feeds a compliance report or a security review. Duplicated entries mean the audit log no longer answers "how many users were deleted" without deduplication logic that does not exist. `AuditBehavior`'s own JSDoc says the opposite of what this wiring does: *"place this near the outside of the chain (e.g. global `before`) so the duration covers the whole handler."* The reported `durationMs` is also per-attempt, not per-operation.

This matters beyond the one handler: `delete-user.handler.ts` is listed in `SKILL.md`'s "positive examples to copy". Developers will copy the ordering.

**Proposed solution.** Move `AuditBehavior` outside `ResilienceBehavior`:

```ts
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [AuditBehavior, { action: AUDIT_ACTIONS.USER_DELETE, severity: AUDIT_SEVERITY.HIGH, metadataFactory: /* ... */ }],
  [CaslBehavior, { rules: [{ action: APP_ACTIONS.DELETE, subject: APP_SUBJECTS.USER }] }],
  [ResilienceBehavior, { handle: isTransientOperationError, retry: { maxAttempts: 3, replaySafe: true, backoff: { type: 'exponential', initialDelay: 25, maxDelay: 100 } } }],
)
```

Audit now records one entry covering the whole operation including all retries, with a duration that reflects real wall-clock cost. Placing audit outside CASL also means denied attempts are audited — usually desirable for a high-severity action; if not, keep it inside CASL but still outside resilience.

**Generalize the guidance.** Add an "ordering" section to `packages/pipeline/README.md` stating the invariant: *behaviors that record a fact about the operation (audit, metrics, dead-letter) belong outside behaviors that can re-execute it (resilience); behaviors that short-circuit (cache, idempotency) belong inside behaviors that must always run (authorization).* The pipeline core already encodes half of this by refusing to relocate a global behavior when a handler redeclares it (`pipeline.bootstrap.service.ts:198-223`) — the rationale is in the code comment but not in the docs.

**Tests to add.** `ddd/users-api/test/event-crosscutting.e2e-spec.ts` or a new spec: force two transient failures on delete, assert exactly one audit record.

---

### ~~F-10 — Four event handlers exist only to log, which the repository's own rules forbid~~ — **Withdrawn**

> **Withdrawn 2026-09-18 — rejected by the repository owner.** `ddd/users-api` is a showcase; these handlers demonstrate that domain events reach handlers and that the correlation ID survives the hop. That purpose was not weighed when this finding was written. `event-handler-substance.grit` keeps reporting them at `warn` so the trade-off stays visible without blocking the build. It also found a fifth handler this review missed. See [§11.5](#115-f-10--rejected-the-showcase-keeps-its-handlers).

| | |
|---|---|
| Category | Self-consistency / dead abstraction |
| Package | `ddd/users-api` |
| Files | `users/cqrs/events/user-deleted.handler.ts`, `roles/cqrs/events/role-created.handler.ts`, `role-updated.handler.ts`, `role-deleted.handler.ts` |

**Current state.** Each is a complete `@EventsHandler` class whose entire body is:

```ts
const correlationId = getCorrelationId();
this.logger.log(`📬 [${correlationId}] UserDeleted — id: ${userId}, username: ${username}`);
```

`SKILL.md`'s anti-pattern list names this exactly: *"Event handlers that only call `Logger`/`getCorrelationId()` without performing meaningful domain work."* The event-handling rules also say to use logging behaviors instead of manual correlation code. None of the four carries `@UsePipeline`, so they also bypass the global `LoggingBehavior` metric line — they are hand-rolling what the pipeline already provides.

**Why it matters beyond tidiness.** These four classes are DI providers, are discovered and (because they have no `@UsePipeline` and the global behaviors apply to events) are wrapped by the bootstrap service, allocate a `PipelineContext` per event, and run the full global chain — `LoggingBehavior`, `TraceBehavior`, `MetricsBehavior`, `ZodValidationBehavior`, `DeadLetterBehavior` — to produce a log line. Every one of them creates an OpenTelemetry span. They are not free, and they teach a pattern the repository asks people not to follow.

**Proposed solution.** Delete all four. Domain events that no one reacts to still flow through `EventBus` and are still visible: `LoggingBehavior` is registered globally with `scope: 'all'`, which covers events, and `TraceBehavior` spans them. If a per-event audit trail is wanted, that is `AuditBehavior`'s job, configured once globally for events, not four bespoke classes.

If a handler must be kept as a placeholder for future work, mark it clearly and give it the pipeline:

```ts
@EventsHandler(RoleDeletedEvent)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class RoleDeletedHandler implements IEventHandler<RoleDeletedEvent> {
  /** Placeholder: role deletion currently requires no downstream reaction. */
  async handle(): Promise<void> {}
}
```

**Secondary note.** Emoji in log messages (`📬`, `🔄`, `✅`, `📧`, `🔗`) appear in these handlers and in both BullMQ processors. In structured JSON logs they are noise; in terminals without full Unicode support they are mojibake. Remove them from production code paths.

---

### F-11 — `RootEntity` exposes public setters for identity and timestamps — **S2**, Strongly recommended

| | |
|---|---|
| Category | Domain encapsulation |
| Package | `@nestjs-pipeline/ddd-core` |
| File | `ddd/core/domain/models/root.entity.ts:199-215` |

**Current design.** `id`, `createdAt`, and `updatedAt` have public setters. The class JSDoc states the reason: *"Accessor-Driven Persistence: Exposes typed getters and setters compatible with MikroORM `accessor: true` mapping without breaking encapsulation."*

**Why the stated rationale does not hold.** It does break encapsulation — `user.id = someOtherUuid` compiles and runs anywhere in the codebase. The setters validate format (`normalizeId` requires a UUID v7) but not legitimacy. Aggregate identity is the one thing in DDD that must be immutable after construction; `updatedAt` is owned by `onUpdate()` and `_version` bookkeeping. A public setter on either is an invitation to bypass `@Mutate`.

This is an infrastructure requirement dictating the domain model's public API — the dependency direction Clean Architecture exists to prevent.

**Proposed solution.** MikroORM's `EntitySchema` (which this repository already uses — see `ddd/users-api/src/persistence/schemas/*.ts`) can map to private fields without accessors:

```ts
// ddd/users-api/src/persistence/schemas/user.schema.ts
export const UserSchema = new EntitySchema<User>({
  class: User,
  properties: {
    id:        { type: 'uuid', primary: true, fieldName: 'id',         name: '_id' },
    createdAt: { type: 'Date', fieldName: 'created_at',                name: '_createdAt' },
    updatedAt: { type: 'Date', fieldName: 'updated_at',                name: '_updatedAt' },
    version:   { type: 'number', fieldName: 'version',                 name: '_version' },
    // ...
  },
});
```

The `name` option targets the private backing field directly; `accessor: true` — and therefore the public setters — becomes unnecessary. Then in `root.entity.ts`, delete the three setters and keep only getters.

**Verify before committing to this.** Confirm against the installed `@mikro-orm/core@^7` that private-field mapping via `name` behaves as expected with `nativeUpdate` and with `em.create`. If it does not, the fallback is a schema-level `getter`/`setter` pair or a dedicated persistence DTO — both preferable to public domain setters.

**Dependencies affected.** All eight schemas in `ddd/users-api/src/persistence/schemas/`, `root.entity.spec.ts`.

**Tests to add.** `root.entity.spec.ts`: a `@ts-expect-error` assertion that `entity.id = '...'` does not compile. Plus a round-trip persistence test proving the ORM still hydrates `_id`/`_createdAt`/`_updatedAt` correctly.

---

### F-12 — Rate-limit partition keys can collide and silently drop the tenant — **S2**, Strongly recommended

| | |
|---|---|
| Category | Security / key derivation |
| Package | `@nestjs-pipeline/rate-limit` |
| File | `packages/pipeline-rate-limit/src/helpers/partitioned-key.ts:110-113` |

Two distinct defects in four lines:

**(a) No delimiter escaping.**

```ts
const parts: string[] = [];
if (includeTenant && context.tenantId) parts.push(context.tenantId);
parts.push(partition, context.requestName);
return parts.join(':');
```

Partition identifiers are frequently emails, external subject claims, or composite IDs — all of which may contain `:`. Tenant `acme`, partition `bob:admin`, request `X` yields `acme:bob:admin:X`. Tenant `acme:bob`, partition `admin`, request `X` yields the identical key. Two different callers share one quota bucket.

Note that `ddd-core`'s `filterCacheKey` solves this correctly (`canonicalizeValue` escapes `\` and `:`). The escaping logic exists in the repository; it is simply not shared.

**(b) A missing tenant silently degrades the key's shape.** With `includeTenant: true` (the default) and `context.tenantId` absent, the tenant segment is omitted entirely. `undefined-tenant:u-123:Cmd` collapses to `u-123:Cmd` — the same key user `u-123` would get in a single-tenant deployment, and a key that no longer signals which isolation domain it belongs to. `onMissingPartition` fails closed for the partition; there is no equivalent for the tenant.

**Proposed solution.** Lift the escaper into `@nestjs-pipeline/core` (it already owns `stableStringify`, which `filterCacheKey` delegates to) and use it from both packages:

```ts
// packages/pipeline/src/helpers/key-segment.ts   (new)
/** Escapes `\` and `:` so joined key segments cannot be confused for one another. */
export function escapeKeySegment(value: string): string {
  return value.replace(/([\\:])/g, '\\$1');
}
```

```ts
// partitioned-key.ts
const requireTenant = options.requireTenant ?? options.includeTenant ?? true;
if (requireTenant && !context.tenantId) {
  throw new MissingTenantContextError(
    `Rate-limit key for ${context.requestName} requires tenant context. ` +
    `Set requireTenant: false for single-tenant deployments.`,
  );
}
const parts = [
  ...(includeTenant && context.tenantId ? [context.tenantId] : []),
  partition,
  context.requestName,
].map(escapeKeySegment);
return parts.join(':');
```

Then refactor `ddd/core/persistence/helpers/filter-cache-key.helper.ts:161-169` to call `escapeKeySegment` instead of its private copy, and use it in the new cache-key helper from F-03.

**Tests to add.** Property-style: for a set of partition/tenant pairs containing `:` and `\`, assert all generated keys are pairwise distinct.

---

### F-13 — `RateLimitBehavior`'s default bucket is shared by every caller — **S2**, Strongly recommended

| | |
|---|---|
| Category | Insecure default |
| Package | `@nestjs-pipeline/rate-limit` |
| File | `packages/pipeline-rate-limit/src/helpers/build-key.ts:19-22` |

**Current behavior.** With no `keyFactory`, the bucket key is `context.requestName`. Every caller of `CreateUserCommand` — every tenant, every principal, every anonymous request — consumes from one bucket.

**Consequence.** The reference application configures `RateLimiterMemory({ points: 5, duration: 60 })`. Under the default key, a single abusive client issuing six `CreateUserCommand`s in a minute locks out **every** user of **every** tenant for the remainder of the window. A rate limiter whose default configuration converts one abuser into a global outage is worse than no rate limiter, because it creates the appearance of protection.

**Stated justification.** `partitioned-key.ts:44-48`: *"`RateLimitBehavior` intentionally keeps `context.requestName` as its default bucket so upgrading this package remains backward-compatible."* The package is at `0.1.0` and unpublished. There is nothing to be compatible with. (This is RC-2 in its purest form.)

**Proposed solution.** Require an explicit key, as in F-03:

```ts
export function buildRateLimitKey(context: IPipelineContext, options: RateLimitBehaviorOptions = {}): string {
  if (!options.keyFactory) {
    throw new TypeError(
      `RateLimitBehavior on ${context.handlerName} requires an explicit keyFactory. ` +
      `A request-name-only bucket is shared by all callers, so one client can exhaust it for everyone. ` +
      `Use createPartitionedRateLimitKeyFactory(...) for per-caller limits, or pass ` +
      `keyFactory: (ctx) => ctx.requestName explicitly to accept a global bucket.`,
    );
  }
  const base = options.keyFactory(context);
  return options.keyPrefix ? `${options.keyPrefix}:${base}` : base;
}
```

The escape hatch remains one line, but it is now a decision someone made rather than one they inherited.

**Migration.** Update `ddd/users-api`: `create-user.handler.ts:57` already passes `createUserRateLimitKey`, and `create-role.handler.ts` should be checked for the same. `packages/pipeline-rate-limit/README.md` needs its quickstart updated.

---

### F-14 — `LoggingBehavior` does not redact secrets by default — **S2**, Strongly recommended

| | |
|---|---|
| Category | Insecure default |
| Package | `@nestjs-pipeline/core` |
| File | `packages/pipeline/src/behaviors/logging.behavior.ts:118-138` |

**Current behavior.** `redactSensitiveKeys` defaults to `false`. Payload logging is off by default (`excludeRequestObj: true`), so the exposure requires a developer to opt into payload logging — which the JSDoc actively encourages with a "Recommended payload logging configuration" example. A developer following the shorter form:

```ts
@UsePipeline([LoggingBehavior, { excludeRequestObj: false }])
```

gets full request bodies in logs, including `password`, `token`, `authorization`, and `cardNumber` — every key already enumerated in `DEFAULT_REDACT_KEYS`, right there in the same package, unused.

**Stated justification.** *"The default is deliberately `false` so upgrading the package does not alter existing log payloads or snapshot tests."* Same reasoning as F-13, same absence of anything to upgrade from. Weighing "a hypothetical future user's snapshot test" against "credentials in logs" should not be a close call.

**Proposed solution.** Flip the default to `true` and rename the option to state what disabling it means:

```ts
/**
 * Masks {@link DEFAULT_REDACT_KEYS} in request/response payload logs.
 * @default true
 */
redactSensitiveKeys?: boolean;
```

Anyone who genuinely wants raw payloads sets `redactSensitiveKeys: false` and owns that choice explicitly.

**Tests to change.** `logging.behavior.spec.ts` — any test asserting unredacted payload output must now pass `redactSensitiveKeys: false` or assert `[REDACTED]`.

---

### ~~F-15 — `DeleteUserCommandRepository` uses the banned manual try/catch and the lint guard does not catch it~~ — **S2**, Strongly recommended

> **Fixed 2026-09-18.** Both delete repositories use `@MapPersistenceErrors` with a new `otherwise` translator; `persistence-lifecycle.grit` now rejects `try`/`catch` inside `save()`; the five guardrails in the table below are implemented. See [§11.2](#112-f-15--declarative-persistence-error-translation-and-five-ci-guardrails).

| | |
|---|---|
| Category | Self-consistency / guardrail gap |
| Package | `ddd/users-api` |
| Files | `src/users/persistence/delete-user.command-repository.ts:34-65`, `biome/plugins/persistence-lifecycle.grit` |

**Current state.** `save()` wraps its body in try/catch, re-throws `OptimisticLockError` and `EntityNotFoundException`, and funnels everything else through `mapPersistenceError`. `SKILL.md`'s anti-pattern list: *"Manual try/catch blocks in command repositories for constraint mapping when `@MapPersistenceErrors` can be used declarative."* It also omits `@AcknowledgePersisted`, which is defensible for a delete (there is no surviving version to acknowledge), but the omission is undocumented at the call site.

**Why it matters more than the one file.** `pnpm lint:persistence` passes. The Grit plugin checks decorator *ordering* when decorators are present; it does not check that they are present, and it does not detect the hand-rolled equivalent. So the repository has a guardrail that creates confidence about a rule it does not actually enforce. This is the most concrete instance of RC-1.

**Proposed solution — two parts.**

1. Convert the repository to the declarative form, or document the exception:

```ts
@Cache<User, null>({ deleteKeys: (user) => [
  filterCacheKey(User.aggregateName, { id: user.id }),
  filterCacheKey(User.aggregateName, { email: user.email }),
]})
@MapPersistenceErrors<[User], User>({
  entity: ([user]) => user,
  unique: [],
  passthrough: [OptimisticLockError, EntityNotFoundException],
})
async save(user: User): Promise<null> { /* nativeDelete + affected-row check, no try/catch */ }
```

This may require adding a `passthrough` option to `@MapPersistenceErrors` so domain errors raised inside the method are not re-mapped. That is a small, worthwhile addition.

2. Extend `biome/plugins/persistence-lifecycle.grit` to flag a `try`/`catch` inside any `save()` in a `*.command-repository.ts`, and to require `@MapPersistenceErrors` on every such `save()`. The plugin infrastructure already exists; it is under-used.

**Broader recommendation (this is the RC-1 fix).** Several `AGENTS.md` rules are mechanically checkable and currently are not:

| Rule | Checkable as |
|---|---|
| No Nest HTTP exceptions in domain/application/behavior code | Grit: forbid importing `NotFoundException`/`ConflictException`/`ForbiddenException`/`UnauthorizedException`/`BadRequestException` under `packages/*/src`, `ddd/core`, `ddd/users-api/src/**/cqrs/**`, `ddd/users-api/src/**/domain/**` |
| Handlers must not import ORM clients | Grit: forbid `@mikro-orm/*` and `MIKRO_ORM_CLIENT` under `**/cqrs/**` |
| Event handlers must do more than log | Grit: flag an `@EventsHandler` class whose `handle` body contains only `Logger` and `getCorrelationId` calls |
| Core is a peer dependency everywhere | Node script in `pnpm check` |
| No `process.env` in `ddd/core` | Grit: forbid `process.env` outside bootstrap/infrastructure paths |

Each is a few lines of Grit. Together they convert five documented rules into enforced ones, and they would have caught F-01, F-05, F-10 and F-15 before review.

---

### F-16 — Deprecated aliases and legacy branches accumulating in unpublished packages — **S3**, Strongly recommended

| | |
|---|---|
| Category | Dead code / API surface |
| Packages | core, casl, zod, resilience, ddd-core |

Complete inventory of surface that exists only for compatibility with versions that were never released:

| Symbol | Location | Status |
|---|---|---|
| `PIPELINE_OPTIONS_REGISTRY` + `clearPipelineOptionsRegistry` | `pipeline/src/decorators/pipeline.decorator.ts:47-63` | Marked `@deprecated`, explicitly documented as not used by execution, still populated on every `@UsePipeline` with options. A process-lifetime `Map` keyed by class name. |
| `RootEntity.markPersisted` | `ddd/core/domain/models/root.entity.ts:299` | Pure alias of `acknowledgePersisted` |
| `createZodCommand` / `createZodQuery` | `pipeline-zod/src/create-zod-request.ts:192,219` | Aliases of `createCommand` / `createQuery` |
| `ZOD_SCHEMA` | `pipeline-zod/src/zod-validation.behavior.ts:282` | Marked `@deprecated`, alias of `ZOD_SCHEMA_KEY` |
| `$kind` | `create-zod-request.ts:152,160` | Duplicates `requestKind` on the same object |
| `CaslEntityAuthorizer` | `entity-authorization.helper.ts:439` | "Backward compatibility alias" for `CaslAuthorizer` |
| `RESILIENCE_ABORT_SIGNAL_ITEM` | `pipeline-resilience/src/helpers/resilience-context.ts:13` | Marked `@deprecated`, still read as a fallback in `getResilienceAbortSignal` |
| `RetryBackoff` string form + `initialDelayMs`/`maxDelayMs` | `policy-factory.ts:79-95` | "Legacy" branch reached via `options as unknown as {...}` |
| `retry.isRetryable` | `policy-factory.ts:260-263` | Second way to express `options.handle`; see below |
| `CacheOptions` positional form | `ddd/core/persistence/decorators/Cache.ts:91-114` | Three-way constructor dispatch |
| `FromCacheOptions` positional form | `FromCache.ts:107-119` | Three-way constructor dispatch |
| `biome.json` override for `**/outcomes/**` | `biome.json` | Directory no longer exists (`DomainOutcome` removed) |
| `ddd/core/package.json` description | mentions "outcomes" | Stale |

`retry.isRetryable` deserves a note beyond removal. In `buildResiliencePolicy`:

```ts
const classifier = options.handle ?? options.retry?.isRetryable;
const base: Policy = classifier ? handleWhen(...) : handleAll;
```

`base` is passed to `buildRetry`, `buildCircuitBreaker` **and** `buildFallback`. So a predicate named `retry.isRetryable`, which a reader will reasonably assume scopes to retries, silently determines which errors trip the circuit breaker and trigger the fallback. That is not merely redundant API — it is misleading API. Delete `isRetryable`; `handle` is the correct and already-documented option.

**Disposition.** Delete all of the above in one commit before the first publish. Every one is a permanent maintenance and documentation cost being paid for a benefit that does not exist. After 1.0 the calculus changes entirely — which is exactly why this must happen before it.

---

### F-17 — `stableStringify` discards the cause of serialization failures — **S3**, Strongly recommended

| | |
|---|---|
| Package | `@nestjs-pipeline/core` |
| File | `packages/pipeline/src/helpers/stableStringify.ts:161-169` |

`toStrictJsonValue` throws precisely diagnosed `TypeError`s — *"Cyclic values are not JSON-serializable"*, *"Symbol-keyed properties are outside the supported JSON domain"*, *"`Map` is outside the supported JSON domain"*. `stableStringify` then catches all of them and throws a single generic message with no `cause`.

This function underpins cache keys, idempotency fingerprints, and `filterCacheKey`. When an idempotency fingerprint fails on a command carrying a `Map`, the operator sees "stableStringify requires an acyclic JSON-serializable value" with no indication of which field or which constraint.

```ts
export function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(toStrictJsonValue(value, true));
  } catch (cause) {
    throw new TypeError(
      'stableStringify requires an acyclic JSON-serializable value.',
      { cause },
    );
  }
}
```

Node 22 (the declared engine floor) supports the `cause` option natively. One line, and `IdempotencyCompletionError` already demonstrates the pattern in this repository.

---

### F-18 — Zod validates twice, synchronously then asynchronously — **S3**, Strongly recommended

| | |
|---|---|
| Package | `@nestjs-pipeline/zod` |
| Files | `create-zod-request.ts:106`, `zod-validation.behavior.ts:345` |

**Current design.** The generated request class parses in its constructor with `schema.safeParse` (synchronous). `ZodValidationBehavior` parses again with `schema.safeParseAsync`. To avoid the second parse being wasted work, the constructor deep-clones the whole instance into a snapshot (`cloneData` per key) and the behavior deep-compares the current instance against it (`hasBeenMutated`) to decide whether to skip.

Two consequences:

1. **Async schemas break at construction.** A schema with `.refine(async ...)` or `.transform(async ...)` throws inside `safeParse` — *"Asynchronous transform encountered during synchronous parse"* — when the command is constructed in the controller, before the pipeline ever runs. The behavior's async support is unreachable for those schemas.
2. **Two deep clones plus a structural diff per request**, to avoid one parse. That is likely a net loss for typical command payloads, and it is a substantial mechanism (`zod-data.helpers.ts`, 190 lines) whose entire purpose is to reconcile the duplication.

**Proposed solution.** Pick one validation site.

*Option A (recommended) — validate in the behavior only.* The constructor assigns raw input and stores the schema; the behavior performs the single authoritative `safeParseAsync`. Async schemas work. `setValidatedData` / `hasBeenMutated` / `cloneData` all disappear. The cost: a command constructed outside a pipeline is unvalidated until it enters one. Given that the only supported way to execute a command is through the bus, and the bus always runs the pipeline, that cost is theoretical.

*Option B — validate in the constructor only, and drop the behavior for schema-bearing classes.* Simpler still, but loses async schema support entirely and leaves the behavior with nothing to do.

Option A also makes the `assertPlainRequestOutput` check needed in one place instead of two (`'constructor'` and `'behavior'` call sites).

**Risk.** Medium — it moves when a validation error surfaces (constructor vs. bus dispatch), which changes the stack trace and possibly which filter catches it. `ZodValidationFilter` handles both. `pipeline-zod`'s 83 tests give reasonable cover for the refactor.

---

### F-19 — Scoped-handler dispatch can route to another application's pipeline — **S3**, Optional

| | |
|---|---|
| Package | `@nestjs-pipeline/core` |
| File | `packages/pipeline/src/services/pipeline.bootstrap.service.ts:56-60`, `:439-460` |

`prototypeRegistry` and `instanceRunnerMap` are module-scoped `WeakMap`s shared by every `PipelineBootstrapService` in the process. For request-scoped handlers, the prototype dispatcher resolves the runner as:

```ts
let activeRunner = this && typeof this === 'object' ? instanceRunnerMap.get(this) : undefined;
if (!activeRunner) {
  const allRunners = Array.from(currentEntry.runners.values());
  activeRunner = allRunners[allRunners.length - 1];   // ← last bootstrap wins
}
```

The design is careful — `runners` is keyed by bootstrap-service instance specifically to support multiple applications — but the fallback picks the most recently registered runner regardless of which application the call belongs to. When `instanceRunnerMap` has no entry for `this` (an instance created by a code path that does not go through the patched `getInstanceByContextId`/`setInstanceByContextId`), a request in application A can execute application B's behavior chain, with B's global behaviors, B's tenant factory and B's correlation runner.

Multiple Nest applications in one process is not exotic here: `ddd/users-api/test/support/e2e-app.ts` builds apps per suite, and Vitest runs suites in the same worker.

**Proposed solution.** Resolve by module identity rather than by registration order. The dispatcher has access to `this` (the handler instance); tag each patched wrapper with the owning bootstrap service and look it up:

```ts
const OWNER = Symbol('PIPELINE_RUNNER_OWNER');
// when the wrapper patches getInstanceByContextId:
untyped(host.instance)[OWNER] = this;   // this = the PipelineBootstrapService
// in the dispatcher:
const owner = untyped(this)[OWNER] as PipelineBootstrapService | undefined;
const activeRunner = (owner && currentEntry.runners.get(owner)) ?? instanceRunnerMap.get(this);
if (!activeRunner) return fallbackMethod.call(this, request);   // fail safe, not last-wins
```

Falling back to the original method — running the handler without a pipeline — is safer than running it under an unrelated application's chain, and it is observable (a warn log makes it diagnosable).

**Tests to add.** `pipeline.bootstrap.lifecycle.spec.ts`: bootstrap two applications with different global behaviors and request-scoped handlers; assert each application's handler runs only its own chain.

---

### F-20 — Redeclaring a global behavior silently discards its global options — **S3**, Optional

| | |
|---|---|
| Package | `@nestjs-pipeline/core` |
| File | `packages/pipeline/src/services/pipeline.bootstrap.service.ts:290-301` |

```ts
const filteredGlobalOptions = new Map(globalOptions);
for (const id of handlerBehaviorIds) filteredGlobalOptions.delete(id);
const mergedOptions = new Map([...filteredGlobalOptions, ...(handlerOptions ?? [])]);
```

If a behavior is configured globally with options and a handler redeclares it **without** options, the global options are deleted and nothing replaces them. The behavior runs at its global position with no configuration at all.

Concretely, against the reference app's `ObservabilityModule` config (`[TraceBehavior, { tracerName: 'users-api' }]` in `globalBehaviors`), a handler writing `@UsePipeline(TraceBehavior)` — a natural way to express "yes, trace this one too" — silently reverts the tracer name to the package default `'nestjs-pipeline'`. Spans land under a different tracer and the developer's dashboards lose them.

The comment says this is intentional: *"a bare `@UsePipeline(Behavior)` intentionally carries no options, so the spread below wouldn't overwrite the global entry without this deletion."* But intentional and discoverable are different properties, and this one is neither documented in the README nor detectable at runtime.

**Proposed solution.** Reverse the default — a bare redeclaration inherits global options — and add an explicit reset token for the rare case where clearing is wanted:

```ts
export const RESET_OPTIONS = Symbol('PIPELINE_RESET_OPTIONS');
// @UsePipeline([TraceBehavior, RESET_OPTIONS])  → run with package defaults
```

Whichever default is chosen, document it in `packages/pipeline/README.md` under global-behavior merging, and add a test in `pipeline.bootstrap.service.spec.ts` pinning the resolved options for all four combinations (global-with-options × handler-bare / handler-with-options).

---

### F-21 — `GetUserContextHandler` is an unauthorized pass-through — **S3**, Optional

| | |
|---|---|
| Package | `ddd/users-api` |
| Files | `src/users/cqrs/queries/get-user-context.handler.ts` |

The handler's entire body is `return await this.queryRepository.find(query)`. It carries no `@UsePipeline`, so no `CaslBehavior`, no authorization rule. It returns a `CaslUserContext` for any `userId` placed in the query.

The repository behind it is narrow today (`get-user-context.query-repository.ts` returns only `{ id, department }`), so the current exposure is small. But it is registered on the `QueryBus`: any code that can dispatch a query can read any user's authorization context, and the return type (`CaslUserContext`) is the type that carries `capabilities`. If the repository is ever extended to populate them — which is exactly what the type invites — this becomes a capability-disclosure endpoint.

Two options, in order of preference:

1. **Delete the handler and the query.** `CaslUserContextResolver` does not use the `QueryBus` (it holds `MikroOrmStore` directly, `casl-user-context.resolver.ts:55`), so the bus registration may already be vestigial. Confirm with a grep for `GetUserContextQuery` dispatches before removing.
2. **Keep it and authorize it.** Add `@UsePipeline([CaslBehavior, { rules: [{ action: 'read', subject: 'UserContext' }] }])` and an explicit capability.

A CQRS handler that only forwards to a repository, with no authorization and no orchestration, is indirection without value — and here the indirection is what makes the missing authorization easy to miss.

---

## 6. Status of the earlier reviews

I re-verified the open items from the five existing documents against `ba0b57d`.

**Resolved since those reviews — do not re-open:**

| Prior finding | Evidence of resolution |
|---|---|
| Delete without optimistic lock check (Astra A-01, Gemini F2, Final F2) | `delete-user.command-repository.ts:36-54` conditions on `{ id, version: getExpectedVersion() }` and inspects affected rows |
| Stale `_persistedVersion` after save (ChatGPT F-05, Astra A-02, Final F3) | `@AcknowledgePersisted` captures the version pre-await and advances on resolution |
| Write-side handlers depending on snapshots (ChatGPT F-06) | `IWriteSideAggregateRepository<TEntity>` returns `Promise<TEntity \| null>`; `update-user.handler.ts` and `delete-user.handler.ts` operate on domain aggregates |
| BullMQ / JWT / env leaking into application code (ChatGPT F-01, F-02) | `user-event-dispatcher.port.ts`, `authentication.ports.ts`, `jose-access-token.issuer.ts`, `env-login-code.verifier.ts` |
| `GetUserContextQueryRepository` doing three jobs (ChatGPT F-07) | Split: the repository is persistence-only, `CaslUserContextResolver` owns request/session extraction, principal type is explicit rather than inferred from ID shape |
| Handlers importing persistence error classifiers (ChatGPT F-08) | `TransientOperationError` + `isTransientOperationError` in `ddd-core`; `delete-user.handler.ts:34` uses the neutral predicate |
| Cache ownership / snapshot contract (Astra A-03) | `toCacheSnapshot`, `MemoryCache` JSON detachment on both `set` and `get`, `alwaysHydrate` + `hydrateFn` enforcement |

**Carried forward into this review** — open at commit `ba0b57d`, with current status:

| Prior finding | This review | Status |
|---|---|---|
| ~~`ForbiddenException` in `CaslBehavior` (Gemini F1, Final F1, Astra A-04)~~ | F-01 | **Fixed 2026-09-18** |
| ~~Two CASL denial families (Packages F14)~~ | F-01 | **Fixed 2026-09-18** |
| Public setters on `RootEntity` identity (Gemini F3, Final F5) | F-11 | Open |
| Event publication via return shape (ChatGPT F-04, Final F4, Astra A-05) | F-07 | Open |
| Resilience policy telemetry contamination (Gemini F7, Final F9, Astra A-10) | F-08 | Open |
| `stableStringify` cause suppression (Gemini F9, Astra A-12) | F-17 | Open |
| `PIPELINE_OPTIONS_REGISTRY` (Gemini F8, Final F10, Astra A-11) | F-16 | Open |
| Zod sync/async asymmetry (Gemini F6, Final F8) | F-18 | Open |
| Correlation-keyed default cache (Packages F02) | F-03, sharpened: the feature is inert, the test locks it in, and the reference app never exercises it | Open |
| Partitioned rate-limit key collisions (Packages F05) | F-12 | Open |
| Sensitive-logging protection opt-in (Packages F11) | F-14 | Open |
| String actor overload misclassified (Packages F20) | F-02, sharpened: the 3-arg form is misparsed, not merely mistyped | Open |
| Documentation drift (ChatGPT F-11, Final F11, Packages F18) | §7 | Open |

**Not previously reported (new in this review):** F-04, F-05, F-06, F-09, F-10, F-13, F-15, F-19, F-20, F-21, and the RC-1/RC-2 syntheses.

---

## 7. Cross-package analysis

**Dependency direction is clean.** Every behavior package depends only on `@nestjs-pipeline/core` and its own domain library. No behavior package imports another. `ddd-core` depends on core and correlation. `users-api` depends on everything. No cycles. This is the part of the design that has held up best.

**One packaging defect** — `pipeline-correlation` peering vs. depending on core (F-06).

**`ddd-core` is not a domain core.** Its `package.json` lists `@mikro-orm/core` under `dependencies`, and its single barrel `index.ts` re-exports the domain layer, the application layer, and the MikroORM-coupled persistence layer (`optimistic-update.ts`, which imports `EntityManager` and `OptimisticLockError`) from one entry point. It also re-exports `AggregateRoot` and `IEvent` straight from `@nestjs/cqrs` (`index.ts:3`).

The practical consequence: anyone importing `DomainException` loads MikroORM. There is no way to consume the domain primitives without the ORM, and the layer boundaries the architecture documents are not expressed in the module system at all.

The fix is not to make `ddd-core` framework-free — the `SKILL.md` is right that the Nest CQRS coupling is deliberate and useful. The fix is to make the ORM coupling optional, which requires only subpath exports:

```jsonc
// ddd/core/package.json
{
  "exports": {
    ".":             { "types": "./dist/index.d.ts",             "default": "./dist/index.js" },
    "./domain":      { "types": "./dist/domain/index.d.ts",      "default": "./dist/domain/index.js" },
    "./application": { "types": "./dist/application/index.d.ts", "default": "./dist/application/index.js" },
    "./persistence": { "types": "./dist/persistence/index.d.ts", "default": "./dist/persistence/index.js" }
  },
  "dependencies": { "@nestjs/common": "^11.2.1", "@nestjs/cqrs": "^11.0.3", "@nestjs-pipeline/core": "workspace:*" },
  "peerDependencies": { "@mikro-orm/core": "^7.1.13" },
  "peerDependenciesMeta": { "@mikro-orm/core": { "optional": true } }
}
```

Then a Grit rule forbidding `@nestjs-pipeline/ddd-core/persistence` imports under `**/cqrs/**` and `**/domain/**` makes the layering enforced rather than aspirational. This is a genuine improvement with a small, bounded cost — unlike a full ORM abstraction, which would be the over-engineering the brief warns against.

**Related: the ORM's error class is the application's concurrency contract.** `DomainExceptionFilter` (`ddd/users-api/src/common/filters/domain-exception.filter.ts:3,76,105`) imports `OptimisticLockError` from `@mikro-orm/core` and catches it at the HTTP boundary. So a MikroORM type travels from the repository, through the application layer, to the presentation filter.

`ddd-core` already demonstrates the correct pattern for exactly this situation with `TransientOperationError` — infrastructure translates its own failures into a neutral error, and the application never sees driver types. Apply the same pattern:

```ts
// ddd/core/domain/exceptions/concurrency-conflict.error.ts   (new)
export class ConcurrencyConflictError extends DomainException {
  constructor(readonly entityName: string, readonly id: string,
              readonly expectedVersion: number, readonly actualVersion?: number) {
    super(`${entityName} ${id} was modified concurrently (expected version ${expectedVersion}).`);
  }
}
```

`optimisticUpdate` and the delete repositories throw it instead of `OptimisticLockError.lockFailedVersionMismatch`. `DomainExceptionFilter` catches only `DomainException` and drops the `@mikro-orm/core` import entirely. Cost: one new error class and about six throw sites. Benefit: the presentation layer stops knowing which ORM is installed, and the filter's `@Catch(DomainException, OptimisticLockError)` collapses to `@Catch(DomainException)`.

**Two correlation mechanisms in one adapter class.** `BullMqUserEventDispatcher` (`ddd/users-api/src/users/jobs/bullmq-user-event-dispatcher.adapter.ts`) propagates correlation two different ways:

```ts
// enqueueWelcomeEmail — correlation ID inside the job payload
await this.welcomeEmailQueue.add('send', addCorrelationId(message));

// enqueueUserBatch — correlation ID smuggled into JobsOptions via a cast
await this.batchUpdateQueue.add('batch-update', items.map(i => ({...i})),
  { correlationId: getCorrelationId() } as JobsOptions & { correlationId: string });
```

The consumers mirror the split: `SendWelcomeEmailProcessor` uses `@WithCorrelation({ extract: (job) => job.data.correlationId })` while `BatchUpdateUsersProcessor` uses `@WithCorrelation({ path: 'opts.correlationId' })`. The second relies on BullMQ round-tripping an unknown property through `job.opts`, which is not part of its documented contract and can break on a minor version. Standardize on the payload form (`addCorrelationId`), which the correlation package explicitly supports.

**Documentation volume is a structural liability.** 326 KB of Markdown across 15 files: root README 64 KB, `pipeline-casl/README.md` 34 KB, `ddd/users-api/README.md` 34 KB, `ddd/core/README.md` 28 KB, `pipeline/README.md` 30 KB. On top of that, JSDoc frequently exceeds the code it describes — `CaslBehavior` carries roughly 400 lines of doc comment for a 330-line class, most of it worked examples that duplicate the README.

Two concrete symptoms of the drift this causes are already visible: `ddd/core/package.json`'s description advertises "outcomes", a concept `SKILL.md` now lists as an anti-pattern; and `biome.json` still carries a lint override for `**/outcomes/**`, a directory that no longer exists.

Recommendation: move worked examples out of JSDoc and into executable example files under `packages/*/examples/` that are type-checked by `pnpm -r build`. A compiling example cannot drift. Keep JSDoc to contract, parameters, and failure modes. Target roughly a 60% reduction in prose without losing information.

---

## 8. Test architecture assessment

**Strengths.** 704 passing tests with genuinely good coverage of the hardest parts. The concurrency e2e suite is unusually strong for a repository this size — `cache-concurrency`, `cache-stale-resurrection`, `cache-write-through-cas`, `cache-key-canonicalization`, `delete-resilience-boundary`, `write-side-hydration`. Architectural contracts get dedicated specs (`cqrs-discovery-without-private-metadata`, `login-without-nested-querybus`, `user-event-dispatch-ports`, `tenant-context-port`, `aggregate-construction`), which is the right instinct: each pins a decision that a future refactor might quietly undo. `cqrs-runtime-errors.spec.ts` at 775 lines suggests serious attention to failure paths.

**Weaknesses, in order of importance.**

**1. A test asserts the wrong thing and locks in a defect.** `packages/pipeline-cache/src/helpers/cache-key.spec.ts:107` asserts different correlation IDs produce different keys — i.e. it asserts the property that makes the cache useless (F-03). This is the specific failure mode the brief calls "false confidence caused by high test counts but weak assertions": the test is green, the assertion is precise, and what it pins down is a bug.

**2. `@nestjs-pipeline/cache` has no integration coverage.** `CacheBehavior` is never attached to a handler anywhere outside a unit test with a mocked store and a hand-supplied key. The package ships a Keyv/cache-manager adapter, a store factory with lazy optional-adapter loading, and a fail-open policy — none of which is exercised against a real store in a real pipeline. Add the e2e test described in F-03.

**3. The persistence lint guard is narrower than it appears.** `pnpm lint:persistence` passes while `DeleteUserCommandRepository` uses the try/catch pattern the architecture documents ban (F-15). A guardrail that passes on a known violation is worse than no guardrail, because it is cited as evidence.

**4. Untested boundaries that the findings above depend on:**

| Boundary | Test to add |
|---|---|
| Barrier vs. write-through race (F-04) | Interleave delete and slower update on one aggregate; assert no resurrection |
| Multi-application scoped-handler isolation (F-19) | Two apps, two global chains, request-scoped handlers; assert no cross-talk |
| Global-vs-handler option merging (F-20) | All four combinations of global/handler options, asserting resolved options |
| Behavior ordering invariants (F-09) | Retry + audit: assert exactly one audit record across N attempts |
| Transport neutrality of denials (F-01) | Assert `CaslBehavior`'s error is not an `HttpException` |
| Core-as-peer invariant (F-06) | Manifest check in `pnpm check` |

**5. Coverage is measured for one package only.** `packages/pipeline-casl/coverage/` exists; no other package has it, and no aggregate threshold is configured. Add `pnpm test:coverage` with a per-package floor, so the cache package's gap becomes visible as a number rather than as a review finding.

**What not to change.** The e2e suite's use of a real app instance (`test/support/e2e-app.ts`) rather than mocked modules is correct and should be extended, not replaced. The behavior unit tests that construct a behavior directly with a stub context are appropriate for option-resolution logic. Do not add mocks to compensate for the missing integration tests — add the integration tests.

---

## 9. Architecture improvement blueprint

Improvements that are not defects, ordered by value-to-cost.

### 9.1 Enforce the architecture in CI (the highest-leverage change available)

Covered in F-15. Five Grit rules plus one manifest script convert the five most-violated `AGENTS.md` rules from prose into gates. This is the single change that most improves the repository's long-term trajectory, because it changes what the next hundred commits are allowed to do.

### 9.2 Make the layer boundary real in `ddd-core`

Covered in §7: subpath exports, optional `@mikro-orm/core` peer, a Grit rule forbidding persistence imports from `cqrs`/`domain` paths, and `ConcurrencyConflictError` replacing `OptimisticLockError` above the repository line. Moderate effort, large clarity gain, no new abstraction layer.

### 9.3 Publish the behavior-ordering contract

The pipeline's ordering semantics are subtle and currently live only in code comments: global-before → handler-only → global-after; a handler redeclaration keeps the global position; handler options override global options (and a bare redeclaration clears them — F-20). Add an "Ordering and composition" section to `packages/pipeline/README.md` with the invariant from F-09 and a worked example of a correct full chain. Consider a development-mode assertion that warns when a recording behavior (audit, metrics, dead-letter) is nested inside a replaying behavior (resilience) — the bootstrap service already knows the full effective order and could check it once, at startup, for free.

Note that the reference app already contains one instance of ordering confusion that such a check would catch: `ObservabilityModule` configures `DeadLetterBehavior` with `ignoreErrors: [ZodValidationError]`, but `ZodValidationBehavior` sits **outside** `DeadLetterBehavior` in the resolved chain (`before: [Logging, Trace, Metrics, Zod]` then `[DeadLetter]`), so a Zod error never reaches the dead-letter behavior at all. The `ignoreErrors` entry — repeated in `ReliabilityModule`'s module defaults — is dead configuration that reads as a safety measure.

### 9.4 Where framework independence is worth pursuing — and where it is not

The brief asks specifically about this. My assessment, dependency by dependency:

| Dependency | Where | Essential? | Recommendation |
|---|---|---|---|
| `@nestjs/cqrs` in `@nestjs-pipeline/core` | Handler discovery, bus integration | **Essential** | Keep. Abstracting it relocates the coupling to the consumer and buys nothing. |
| `@nestjs/cqrs` `AggregateRoot` in `RootEntity` | Domain base class | **Incidental** | Low-value to change. `AggregateRoot` is a thin event buffer; replacing it with an own implementation means reimplementing `apply`/`commit`/`getUncommittedEvents` and adapting at the `CommandBaseHandler` boundary. The gain is symbolic. **Do not do this** unless a non-Nest consumer materializes. |
| `@nestjs/common` `HttpException` in `@nestjs-pipeline/casl` | Denial errors | **Incidental** | **Remove** — F-01. Genuine transport coupling in a transport-agnostic library. |
| `@mikro-orm/core` in `ddd-core` | `optimisticUpdate`, `OptimisticLockError` | **Incidental at the boundary, essential inside it** | **Isolate** — §9.2. Keep the ORM in the persistence subpath; keep it out of the domain, application and presentation layers. |
| `cockatiel` in `@nestjs-pipeline/resilience` | Policy engine | **Essential** | Keep, and keep it visible — `options.policy` accepting a raw Cockatiel policy is a good escape hatch. Do not wrap it in a house abstraction. |
| `@casl/ability` in `@nestjs-pipeline/casl` | Ability model | **Essential** | Keep. The package is named for it. |
| `@openfeature/server-sdk` in feature-flags | Provider protocol | **Essential** | Keep. OpenFeature *is* the vendor abstraction. |
| `cache-manager` + `keyv` in `@nestjs-pipeline/cache` | Store abstraction | **Incidental but cheap** | Keep. `IPipelineCache` already isolates it (`adapters/cache-manager.adapter.ts`), which is the right amount of abstraction. |
| `process.env` in `ddd-core` (`filter-cache-key.helper.ts:139`) | `DB_DEFAULT_SCHEMA` at module load | **Incidental** | **Remove** — F-05. |

The general principle I would apply here: abstract a dependency when the abstraction is **smaller** than what it hides. `IPipelineCache` (3 methods over cache-manager) qualifies. A mediator over `@nestjs/cqrs` does not. `ICache`/`IRateLimiterLike`/`IAuditSink`/`IdempotencyStore`/`DeadLetterTransport` are all correctly sized already — this repository has generally got this right, and the two exceptions (CASL's HTTP exception, ddd-core's ORM barrel) are leaks rather than missing abstractions.

### 9.5 Reduce the API surface before publishing

F-16 lists every deprecated alias, legacy branch and duplicate accessor. Beyond deletion, three simplifications worth making in the same pass:

- **Collapse `@Cache` and `@FromCache` to options-object-only.** The positional forms exist only for brevity and cost a three-way runtime dispatch each. One call shape, checked by the compiler.
- **Collapse `PipelineModule.forRoot(array | options)` to options-only.** The bare-array form is already confusing enough that its JSDoc needs two paragraphs explaining that it does *not* make the listed behaviors run globally (`pipeline.module.ts:44-45`, `:91`). If a shorthand needs that much defending, it costs more than it saves.
- **Split `safeSanitize`.** `sanitizeValue` (`helpers/safeStringify.ts:121-287`) is 165 lines handling ten type branches across two modes (`'json'` and `'clone'`), with the mode checked inside nearly every branch. Two visitors sharing a traversal skeleton would be shorter and each would be readable end to end.

### 9.6 Reconsider `BaseCommand.getUpdateFields()`

```ts
getUpdateFields(exclude: string[] = ['id']): string[] {
  return Object.keys(this).filter(k => !exclude.has(k) && this[k] !== undefined);
}
```

Used at `update-user.handler.ts:48` to tell `CaslAuthorizer` which fields to field-authorize. The problem: the authorization surface of an update is derived by reflecting over the command's own enumerable keys. If a future `UpdateUserCommand` gains a field with a schema default, that field is always "provided" and is always field-checked; if a field is added and the capability set is not updated, authorization silently widens or narrows depending on which side changes first.

Make the authorized surface explicit and reviewable:

```ts
export class UpdateUserCommand extends createCommand(UpdateUserSchema, BaseCommand) {
  /** Fields this command may mutate. Field-level authorization is checked against this list. */
  static readonly MUTABLE_FIELDS = ['username', 'department'] as const;
}
// handler:
this.authorizer.authorize('update', user,
  UpdateUserCommand.MUTABLE_FIELDS.filter(f => command[f] !== undefined));
```

Now adding a field to the schema without adding it here is a visible omission in review, rather than a silent change in authorization behavior. `CaslBehavior`'s `fieldsFromRequest` documentation already warns about exactly this hazard (*"an inspection list, not an input schema allowlist"*) — this makes the list explicit at the one place it matters.

---

## 10. Delivery order

Each phase is independently shippable and leaves the repository in a better state than it found it.

**Phase 1 — Security and correctness gates (blocks any publish).**

| Item | Finding | Effort | Status |
|---|---|---|---|
| ~~`CaslBehavior` throws `UnauthorizedActionException`~~ | F-01 | S | **Done** |
| ~~Core becomes a peer dependency of `pipeline-correlation`~~ | F-06 | XS | **Done** |
| ~~`filterCacheKey` fails closed on missing tenant~~ | F-05 | S | **Done** |
| Barriers win over write-through; bounded barrier TTL | F-04 | M | Open |
| Require explicit cache key; ship partitioned helper | F-03 | M | Open |
| Remove `CaslAuthorizer`'s actor-first overload | F-02 | S | Open |

**Phase 2 — Enforce the rules that already exist.**

| Item | Finding | Effort | Status |
|---|---|---|---|
| ~~Five Grit rules + core-as-peer manifest check~~ | F-15, RC-1 | M | **Done** |
| ~~`DeleteUserCommandRepository` → declarative lifecycle~~ | F-15 | S | **Done** |
| ~~Delete the four log-only event handlers~~ | F-10 | XS | **Withdrawn** — showcase code; rule reports at `warn` |
| Reorder audit outside resilience; document the invariant | F-09, §9.3 | S | Open |
| Remove dead `ignoreErrors: [ZodValidationError]` config | §9.3 | XS | Open |
| Require explicit rate-limit key; escape key segments | F-12, F-13 | S | Open |
| `redactSensitiveKeys` defaults to `true` | F-14 | XS | Open |

**Phase 3 — Contracts and encapsulation.**

| Item | Finding | Effort |
|---|---|---|
| `CommandOutcome` — compiler-enforced event publication | F-07 | M |
| Remove `RootEntity` public setters; schema-level field mapping | F-11 | M |
| `ddd-core` subpath exports; ORM becomes an optional peer | §9.2 | M |
| `ConcurrencyConflictError` replaces `OptimisticLockError` above the repository | §7 | S |
| Per-invocation resilience telemetry labels | F-08 | S |

**Phase 4 — Surface reduction and cleanup.**

| Item | Finding | Effort |
|---|---|---|
| Delete every deprecated alias and legacy branch | F-16 | M |
| Single-site Zod validation | F-18 | M |
| `stableStringify` preserves `cause` | F-17 | XS |
| Scoped-handler owner resolution | F-19 | S |
| Global/handler option merging: fix and document | F-20 | S |
| `GetUserContextHandler`: delete or authorize | F-21 | XS |
| Explicit `MUTABLE_FIELDS` replaces `getUpdateFields()` reflection | §9.6 | S |
| Move JSDoc examples into compiled example files | §7 | L |

**Suggested verification sequence at each phase boundary:**

```bash
pnpm check                      # biome + all four grit plugins
pnpm lint:persistence           # persistence lifecycle structure
pnpm -r build                   # every package compiles
pnpm test                       # 704 unit tests
pnpm test:e2e                   # requires Redis + Postgres — run before Phase 1 and after Phase 3
```

---

## Closing note

The distance between this repository and a strong 1.0 is smaller than the finding count suggests. Almost every item above is a local fix to a well-structured piece of code, and several are single lines. What the list actually measures is the gap between an architecture that is thoroughly *documented* and one that is thoroughly *enforced* — and that gap is closable with roughly a day of Grit rules and a pass through the anti-pattern list the repository already wrote for itself.

~~The two things I would do first, if only two were possible: make core a peer dependency of `pipeline-correlation` (F-06, one line, prevents a class of bug that is nearly undiagnosable in production), and add the five CI rules (F-15, half a day, prevents the next twenty findings from being written).~~

> **Done 2026-09-18.** Both were applied, and clearing the guardrails they installed also
> closed F-01 and F-05. The prediction held in one respect worth recording: the event-handler
> rule immediately found a fifth violation this review had missed by hand. The next two are
> F-03 and F-04 — see [§11.6](#116-not-applied).

---

## 11. Applied changes

Record of the work applied on 2026-09-18, after the review was written. Verified with
`pnpm check` (exit 0), `pnpm -r build` (0 TypeScript errors) and `pnpm -r test`
(1,466 tests passing across 14 workspaces).

### 11.1 F-06 — core is now a peer dependency everywhere

All eleven behavior packages declare `@nestjs-pipeline/core` under `peerDependencies` as
`workspace:^`. `pipeline-correlation` was the one that had it under `dependencies`; the other
ten already peered it but pinned a literal `^0.1.19`, which every core release would have
required editing in eleven manifests and which goes stale silently when it is not. pnpm
rewrites `workspace:^` to `^<core version>` when the tarball is built — verified by packing
`pipeline-correlation` and reading the published manifest — so the range now tracks core with
no manual step.

The invariant is guarded by `packages/pipeline/src/package-boundaries.spec.ts`, which runs
under `pnpm test`. It lives in a test rather than a Grit plugin because Biome's GritQL engine
parses only JavaScript and TypeScript: a `language json` pattern compiles but never matches,
so a manifest rule written that way would pass silently — the worst failure mode a guardrail
can have. It lives in the core package because it is core's own contract that every sibling
resolves exactly one copy of it. Verified by reintroducing the original manifest, which fails
two of its cases before being restored.

### 11.2 F-15 — declarative persistence error translation, and five CI guardrails

**`@MapPersistenceErrors` gained an `otherwise` translator.** The decorator already passed
unmatched errors through with their identity intact, so the `passthrough` option proposed in
F-15 turned out to be unnecessary. What was genuinely missing was a declarative home for
*transient* classification: `mapPersistenceError` is a separate concern from constraint
mapping, and the delete repositories were hand-rolling it. `otherwise?: (error, entity) =>
unknown` runs after constraint matching and returns either the error unchanged or a
replacement.

`DeleteUserCommandRepository` and `DeleteRoleCommandRepository` now use it, replacing a
ten-line `try`/`catch` each. The explicit `OptimisticLockError` / `EntityNotFoundException`
re-throw guard was dropped because `mapPersistenceError` already returns non-transient errors
unchanged. This also removed an asymmetry the review had not called out: the update path
carried `@MapPersistenceErrors({ unique: [] })` and therefore performed no transient
classification at all, while the delete path did it by hand. Both are now declarative.

**Five guardrails** now run in `pnpm check`:

| Guardrail | Enforces | Severity |
|---|---|---|
| `package-boundaries.spec.ts` (vitest) | core is a `workspace:^` peer everywhere; no sibling or `ddd/*` runtime deps | error |
| `transport-neutral-errors.grit` | no NestJS HTTP exceptions in domain/application/behavior code | error |
| `handler-boundaries.grit` | no ORM or persistence implementations under `cqrs/` and `application/` | error |
| `core-environment.grit` | no `process.env` in published packages or `ddd/core` | error |
| `event-handler-substance.grit` | `@EventsHandler` classes that only produce observability output | warn |

`persistence-lifecycle.grit` also gained a sixth rule rejecting `try`/`catch` inside a
`*CommandRepository.save()`, which is what made the manual blocks visible in the first place.

Two implementation notes for anyone extending these, both discovered by iterating against the
Biome CLI rather than from documentation:

- Biome's `JsNamedImportSpecifier` matches only the **aliased** form (`X as Y`). A plain
  `import { X }` is a `JsShorthandNamedImportSpecifier`, so any import rule needs both. The
  pre-existing rule in `persistence-lifecycle.grit` matches aliases only, which is correct
  for its purpose — it exists to reject aliasing — but it is not a template to copy.
- Class decorators are **siblings of the class inside the enclosing `JsExport`**, not children
  of `JsClassDeclaration`. `JsClassDeclaration() <: contains JsDecorator(...)` silently never
  matches; the export node is the correct anchor.
- `register_diagnostic(message=...)` accepts string literals only. A pattern call there fails
  at runtime with `cannot make resolved pattern from arbitrary pattern CALL`, which Biome
  reports as an `info` rather than an error — so a broken rule looks like a passing one.

### 11.3 F-01 — CASL denials are transport-neutral

`CaslBehavior` no longer imports or throws `ForbiddenException`. Both throw sites now raise
`UnauthorizedActionException`, the package's existing framework-neutral denial error, carrying
the failing `action`, `subject` and `fields`. `UnauthorizedActionFilter` already maps it to
HTTP 403, so the HTTP contract is unchanged.

`ReliabilityModule` correspondingly lists `UnauthorizedActionException` instead of
`ForbiddenException` in `DeadLetterModule`'s `ignoreErrors` — removing the last place where
the application was compensating for the library's transport leak.

The 21 assertions in `casl.behavior.integration.spec.ts` were updated, and a regression guard
was added asserting that the thrown error is **not** an `HttpException` and exposes no
`getStatus`. That assertion is what keeps the fix from silently regressing.

### 11.4 F-05 — tenant resolution fails closed in every environment

`resolveTenantSchema` no longer substitutes a shared namespace. The `NODE_ENV === 'production'`
gate is gone, along with the module-load `process.env.DB_DEFAULT_SCHEMA` read and the
`DEFAULT_TENANT_SCHEMA` export from that helper. Missing tenant context now raises
`MissingTenantContextError`, a new `DomainException` subclass exported from
`@nestjs-pipeline/ddd-core`.

The application's own `DEFAULT_TENANT_SCHEMA` in `persistence/tenant-options.ts` is untouched:
that one names a database schema, which is a different concern from partitioning a cache key.

Test impact was contained. The two specs asserting the fallback were inverted and, in both,
the single "throws in production" case was replaced with a parameterized case covering
`production`, `staging`, `test`, `development` and an unset `NODE_ENV` — the environments where
the old gate failed open.

Fourteen repository unit tests construct a repository directly and call it outside a running
pipeline, so nothing populates `context.tenantId`. Each now wraps just the repository call in
`pipelineStore.run({ tenantId: 'tenant' }, …)`, which is the idiom
`ddd/core/persistence/helpers/filter-cache-key.helper.spec.ts` already uses for the same
situation. Their key assertions were already written against the `tenant:` namespace and did
not change.

An earlier attempt introduced a shared `enterTestTenant()` helper and called it in every test
of the ten affected files. That was wrong twice over: it wrapped a one-line primitive in an
indirection that hid which mechanism was in play, and it touched 39 tests when only 14 depend
on tenant context. Ambient alternatives were ruled out empirically first — Vitest does not
propagate `AsyncLocalStorage` into a test body from a `beforeEach` hook, from an `auto`
fixture, or from module top-level scope, because it roots each test in its own async context.

### 11.5 F-10 — rejected; the showcase keeps its handlers

The review recommended deleting five event handlers that only log. The repository owner
rejected this: `ddd/users-api` is a showcase, and those handlers demonstrate that domain events
reach handlers and that the correlation ID survives the hop. That is a legitimate purpose the
review did not weigh, and the finding is withdrawn for this repository.

`event-handler-substance.grit` was kept but set to `warn`. It reports all five without failing
the build, so the trade-off stays documented rather than invisible, and the rule remains ready
to be raised to `error` in a real application. `pnpm check` exits 0 with five warnings.

Note that the rule detected a fifth handler the manual review had missed —
`auths/cqrs/events/auth-login.handler.ts`. That is the argument for mechanical enforcement in
one line: the reviewer found four, the rule found five.

### 11.6 Not applied

Every other finding stands as written. In priority order, the remaining Phase 1 items are
**F-03** (the cache key that can never hit), **F-04** (barriers losing to write-through) and
**F-02** (the `CaslAuthorizer` overload that misparses a documented call).
