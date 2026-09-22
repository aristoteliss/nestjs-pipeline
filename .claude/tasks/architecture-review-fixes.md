# Task Context

## Task

Fix the high- and medium-severity findings of `docs/reviews/Architecture.Review.el.md`,
package by package in the review order; skip low-severity findings.

## Goal

Every high/medium finding is either repaired with a regression test, or has a recorded
decision explaining why the repair is a documentation/contract clarification instead.
Package tests, `pnpm lint` and `pnpm lint:persistence` pass.

## Scope

In scope, in order: packages/pipeline (P-01, P-02, P-04, P-11, P-12),
pipeline-correlation, pipeline-casl, pipeline-opentelemetry, pipeline-zod, pipeline-audit,
pipeline-cache, pipeline-feature-flags, pipeline-idempotency, pipeline-rate-limit,
pipeline-resilience, ddd/core, ddd/users-api, cross-cutting (X-*).
Out of scope: low-severity findings; pipeline-deadletter (no high/medium findings).

## Current Status

Uncommitted-change review completed with targeted fixes; verification pending with the owner.
ddd/core D-03/D-04 and users-api U-01/U-09 repaired (static checks only). Remaining: U-03, X-01, X-02.
Owner instruction: do not run tests; provide commands for the owner to run.

## Plan

- [x] packages/pipeline: P-01, P-02, P-04, P-11, P-12
- [x] pipeline-correlation: C-01, C-05
- [x] pipeline-casl: A-01, A-03
- [x] pipeline-opentelemetry: O-04, O-06 (users-api), O-08
- [x] pipeline-zod: Z-06 (users-api)
- [x] pipeline-audit: AU-01, AU-06 (users-api), AU-08
- [x] pipeline-cache: CA-01, CA-02, CA-03
- [x] pipeline-feature-flags: FF-01
- [x] pipeline-idempotency: I-01 (users-api), I-02, I-03
- [x] pipeline-rate-limit: RL-01, RL-02 (users-api)
- [x] pipeline-resilience: R-02
- [x] ddd/core: D-01, D-09, D-10, D-03, D-04
- [~] ddd/users-api: U-01, U-09 done; U-03 (medium) NOT started
- [ ] cross-cutting (2 medium)
- [x] Entity mutation API: single decorated User.update/delete and Role.rename/delete
  returning `this`, shared protected applyPatch, Auth conditional mutations preserved.
- [x] Showcase migration consolidation: complete schema, demo seed and materialized
  permissions in Migration20260830000000; obsolete follow-up migrations removed.
- [x] Review current staged and unstaged changes; repair confirmed code-path defects
  and misleading comments/documentation without undoing the owner's migration decision.
- [ ] Owner runs regression suites and release verification for the review fixes.

## Decisions

- P-01: kept the published `SET_TENANT_ID` export (compatibility); made the tenant
  write-once per context — assigning a different value, or clearing it, throws.
- P-02: added optional `IPipelineBehaviorOptionsResolver<TOptions>` instance interface in
  core; bootstrap uses a type guard; cache/resilience/rate-limit/idempotency/feature-flags
  declare it. Merge policies stay per package.
- P-04: redaction matching ignores case, `_` and `-`; default list gained
  passwordHash, idToken, sessionToken, clientSecret, privateKey, xApiKey,
  proxyAuthorization, setCookie. `excludeKeys` stays exact/case-sensitive (documented)
  to avoid a silent compatibility change.
- P-11: `excludeKeys` also applies to cloned `Error` properties and cloned `Map` string keys.
- P-12: an unowned instance of a prototype shared by several applications now throws
  instead of running without its pipeline (fail closed); orphaned dispatcher logger removed.
- C-01: new `correlationPipelineOptions()` preset returns factory+runner together;
  users-api uses it. No core diagnostic (factory alone is legitimate for custom sources).
- C-05: middleware defaults to maxLength 128 and `DEFAULT_CORRELATION_ID_PATTERN`
  (`[A-Za-z0-9._~:/+=@-]`); `validateIncoming` replaces the pattern; constants exported.
- A-01: placeholder values must be string/number/boolean/null or arrays of those;
  objects throw (no operator injection).
- A-03: documentation only (JSDoc on `can`/`authorize`, README example verified by a
  temporary probe: `profile.**` makes `can` and `project` agree). No contract change.
- O-08: when `startActiveSpan` throws, the handler's own outcome (result or business
  error) is returned via `runOnce()`; the tracer error never replaces it.
- O-06: removed signal listeners from `tracing.ts` (exports `shutdownTracing`); new
  `ddd/users-api/src/graceful-shutdown.ts` (`closeOnShutdownSignals`): SIGTERM/SIGINT →
  `app.close()` → telemetry flush → re-raise the signal. `import './tracing'` stays the
  first (side-effect) import so Biome cannot reorder it below NestJS.
- O-04: added `<ITEM>_TOKEN` typed `PipelineItemToken`s over the existing symbols in
  audit/cache/deadletter/idempotency/feature-flags/rate-limit (same map keys, symbols kept);
  writers use `setPipelineItem`; users-api telemetry bridge reads without casts.
- Z-06: `UpdateUserCommand` schema is the single rule source; DTO reuses its field
  schemas and `EMPTY_USER_UPDATE_MESSAGE`; mapper pipes into `UpdateUserCommand.schema`.
- AU-01: one `findInvalidFactory` check used by a new `PIPELINE_BEHAVIOR_CONTRACT.validate`
  (bootstrap diagnostic) and by the runtime pre-execution guard; `AuditBehavior` implements
  `resolveEffectiveOptions` so validators see module defaults.
- AU-08: all audit diagnostic logging goes through a try/catch `diagnose()`.
- AU-06: audit added to create/update user, create/update role, logout (placed innermost
  after idempotency on creates so a replay does not add a record); new AUDIT_ACTIONS;
  ObservabilityModule JSDoc now says operational (console, fail-open) audit, not a
  compliance ledger; `test/command-audit-coverage.spec.ts` pins coverage.
- CA-01: a miss stores and returns the JSON round-trip of the result, so hit and miss
  have the same shape; a result without a JSON form is returned uncached with a warning.
  (`toStrictJsonValue` rejected: it throws on `undefined` properties.)
- CA-02: `PIPELINE_CACHE`/defaults are provider factories over an internal
  `CACHE_MODULE_OPTIONS` token (built per application at DI time); new `forRootAsync`;
  internal `CacheConnectionLifecycle` disconnects on shutdown only a cache built from
  `store`/default; supplied `cache`/`stores` stay caller-owned. users-api uses forRootAsync.
- CA-03: `requireScope` defaults to `true`; creating a factory without `scope` throws
  unless `requireScope: false` (fail fast at declaration). Breaking for consumers
  relying on the old default — needs a release note.
- FF-01: internal `RegisteredProviderLifecycle` swaps a provider the module registered for
  `NOOP_PROVIDER` on shutdown (SDK closes it) only if still current for its domain; never
  global `OpenFeature.close()`; supplied `client` untouched. README explains domains.
- I-03: JSDoc example and core README use `createPartitionedIdempotencyKeyFactory`.
- I-02: default `MemoryIdempotencyStore` is created per application (factory) and destroyed
  on shutdown; supplied stores caller-owned; README states capacity/per-process limits.
- I-01 (owner decision 2026-09-23: optional Idempotency-Key): create user/role commands
  carry optional `idempotencyKey` (header `Idempotency-Key`, 1-255 chars) and the key
  factory uses it with `onMissingOperation: 'skip'`; no header → no dedup, unique
  constraint answers 409. Regression tests: unit (recreate under new key) and e2e.
- RL-01/RL-02 (owner decision 2026-09-23: per-handler limits, no Redis dependency): one
  `RateLimiterMemory(RATE_LIMIT_CAPACITY = 60/60s)`; per-call `points` from
  `RATE_LIMIT_COST` (login 3 → 20/min per IP, refresh 1 → 60/min per IP, create-user 1 →
  60/min per acting principal). Login keyed by `clientIp` (new required field on
  `CreateAuthCommand`, from `req.ip`), create-user by trusted principal. Per-process limit
  documented. Trade-off: no per-account limit for distributed guessing (one RateLimitBehavior
  per handler).
- R-02: new `timeout.replaySafe` acknowledgement; an aggressive (default) timeout on a
  command/event without it is a bootstrap diagnostic (and runtime configuration error), like
  `retry.replaySafe`. Default strategy unchanged (cooperative can hang on uncooperative work).
- D-01/D-09: `MemoryCache` revisions come from one cache-wide counter; absent keys report an
  absence revision that advances on any eviction and on `clear()`, so dropped metadata never
  re-validates an old token. Regression tests fail before / pass after.
- D-10: on a versioned adapter `@Cache` write-through uses only `tryFill`; with no observed
  revision it `invalidate`s the key (never an unfenced `set`). Tests fail before / pass after.
- e2e follow-ups from user run: refresh throttle test now expects 60/min (auths.e2e); role
  replay test sends `Idempotency-Key` (roles.e2e).

- Owner decision (2026-09-23): users-api is a showcase; the merged initial migration is
  intentional, with no upgrade compatibility requirement for existing showcase databases.
- Entity mutations: `applyPatch` validates/normalizes a complete patch before field writes;
  `@ApplyMutation` completes lifecycle/events and preserves the method result. Business
  validation must precede the patch; failures after writes do not roll back the aggregate.
  User/Role wrappers are removed. Auth retains conditional orchestration to preserve grace
  refreshes and repeated-revocation no-ops. The owner reported the mutation checks green.
- Current review findings are code-path inferences, not newly reproduced runtime failures:
  cache read failures bypassed the new JSON result contract; cache diagnostics could replace
  results/errors; tracing could execute synchronous throws twice and abandon a rejected
  span callback. Fixed these paths and added/adjusted regression coverage.
- Test corrections: the feature-flag lifecycle helper invokes the client factory once;
  idempotency test titles describe the exercised behavior; caller-owned test stores are
  cleaned up. The single-migration test helper no longer accepts an unused target option.
- Documentation cleanup: rate-limit guarantees state per-IP/per-process limits, audit
  construction errors follow failOpen, and useful module purpose/configuration descriptions are retained without repetition
  or change-history narratives (owner clarification).

- D-03: a cache decorator on an instance with no `cache` property logs one warning per
  class and passes through. Throwing was rejected: consumers compiled with
  `useDefineForClassFields: false` do not emit a declared-only field. A declared but unset
  `cache` stays silent (deliberately uncached).
- D-04 (owner choice: always hydrate): `@FromCache` rehydrates every hit when a hydrator
  applies; `query.hydrate` no longer gates hydration and `alwaysHydrate` does not change
  results. Without a hydrator, only plain data (JSON-shaped arrays/objects/primitives) is
  cached; a class result or a `serializeFn` reshape is returned uncached with a
  once-per-decoration warning.
- U-01: the shared-code adapter is renamed `SharedDemoLoginCodeVerifier` and documented as
  a demo mechanism, not user authentication. Production refuses it unless
  `AUTH_SHARED_LOGIN_CODE=true` (acknowledgement pattern, like aggressive timeouts); the e2e
  app sets it. "one-time/temporary" wording removed. The unknown-user timing gap (one
  SHA-256 skipped) was left: both paths do the same database lookup, which dominates.
- U-09: persistence throws `InvalidTenantSchemaError`/`UnknownTenantSchemaError`
  (`persistence/tenant-schema.errors.ts`); `TenantSchemaMiddleware` maps the invalid header
  to 400 as before. Unknown tenants are already 403 at the middleware, so a store-level
  unknown tenant is a misconfiguration (500, dead-letter capturable).
  `transport-neutral-errors.grit` now includes `ddd/*/src/**/persistence/**`.

## Modified Files

- ddd/users-api/src/auths/infrastructure/shared-demo-login-code.verifier.ts (renamed from
  env-login-code.verifier.ts), auths.module.ts, authentication-adapters.spec.ts,
  services/user-login.service.ts, application/README.md, README.md,
  test/support/e2e-app.ts — U-01
- ddd/users-api/src/persistence/tenant-schema.errors.ts (new), tenant-options.ts,
  mikro-orm.store.ts, middlewares/tenant-schema.middleware.ts (+spec), biome.json — U-09
- ddd/core/persistence/helpers/cache-owner.helper.ts (new, internal),
  persistence/decorators/Cache.ts, FromCache.ts (+specs), application/query.options.ts,
  README.md, CLAUDE.md — D-03, D-04
- packages/pipeline/src/pipeline.context.ts, constants/pipeline-context.constants.ts,
  pipeline.context.spec.ts, README.md — P-01
- packages/pipeline/src/interfaces/pipeline.behavior.interface.ts,
  services/pipeline-contracts.ts, five `*.behavior.ts` — P-02
- packages/pipeline/src/helpers/safeStringify.ts (+spec) — P-04, P-11
- packages/pipeline/src/services/pipeline.bootstrap.service.ts,
  pipeline.bootstrap.scoped-context.spec.ts, README.md — P-12

## Tests and Verification

### Current uncommitted-change review

- Owner-run users-api suite reported one failure in `test/behaviors.spec.ts`: the retry
  fixture retained an implicit aggressive timeout on a command. Set its timeout strategy
  to `cooperative`; retry assertions and production safety checks remain unchanged.
  Owner reported the focused rerun green; full-suite rerun remains pending.

- No tests or runtime probes run, per owner instruction. New regression tests are pending.
- Earlier test totals below are historical; they do not validate these latest review fixes.
- Review details and recommended commands: `docs/reviews/Architecture.Review.el.md`, section 18.
- Static verification: `pnpm lint` passed (workspace typechecks and persistence/domain
  lint guards); `pnpm check` passed. Test suites remain pending with the owner.

- D-03/D-04: `pnpm --filter @nestjs-pipeline/ddd-core lint` passed; Biome check on
  ddd/core clean; `pnpm lint:persistence` clean (728 files). Specs updated, not run.
- U-01/U-09: `pnpm --filter @nestjs-pipeline/ddd-users-api typecheck` passed; Biome clean;
  `pnpm lint:persistence` clean (729 files). A temporary probe confirmed the Grit rule
  fires under users-api persistence; probe removed. Specs updated, not run.

- Owner-run users-api suite: `test/auth-sessions-persistence.spec.ts` failed with
  "Unexpected end of JSON input" in `Migrator.getSchemaFromSnapshot`. Cause: the shared
  `migratedDb` helper kept MikroORM migration snapshots on, so parallel test files raced
  on `src/persistence/migrations/.snapshot-tenant.db.json`. The helper now uses the
  explicit migration list with `snapshot: false`, as the in-memory persistence specs do.
  Removed the truncated gitignored snapshot. Rerun pending.

### Earlier work

- packages/pipeline: `pnpm --filter @nestjs-pipeline/core test` 293 passed; lint clean.
- cache/resilience/rate-limit/idempotency/feature-flags/audit/deadletter: tests pass; lint
  clean after `pnpm --filter @nestjs-pipeline/core build` (packages typecheck against dist).
- users-api: `pnpm --filter @nestjs-pipeline/ddd-users-api test` 737 passed (after pipeline).
- correlation: 86 tests pass, lint clean; casl: 176 tests pass, lint clean.
- ddd/core 365 passed, lint clean; `pnpm lint:persistence` clean (727 files);
  users-api 757 passed.
- NOT RUN: `pnpm test:e2e` — no Docker daemon (Testcontainers Redis). e2e specs were
  updated for I-01 (users.e2e, pipeline-packages.e2e) and must be run where Docker exists.
- opentelemetry 62, audit 72, cache 76, deadletter 53, idempotency 126, feature-flags 38,
  rate-limit 52 — all pass, lint clean. users-api 740 passed, lint clean.

## Risks

- Published behavior changes that need release notes: P-01 write-once tenant, P-12 throw
  instead of unpiped run, C-05 correlation-ID defaults, A-01 object placeholder values
  throw, CA-01 miss returns JSON form, CA-03 `requireScope` default, D-04 `@FromCache`
  hits always rehydrated and non-plain results without a hydrator left uncached.
- users-api deployments running with NODE_ENV=production must set
  `AUTH_SHARED_LOGIN_CODE=true` or login returns 500 (`AuthConfigurationException`).
  `.env.example` was not readable in this session; the owner should document the variable there.

## Open Questions

## Next Steps

1. Re-run `pnpm test:e2e` where Docker is available (user-reported failures in auths/roles
   e2e were fixed but not re-run here).
2. ddd/users-api U-03; then cross-cutting X-01, X-02.
3. Map update (`pnpm context:update`, gotchas for graceful shutdown, Idempotency-Key,
   rate-limit keys), `pnpm lint`, `pnpm test:release` (published exports changed).

## Snapshot Impact

To be assessed at the end (P-07-style private API notes, command changes).

## Last Updated

2026-09-23
