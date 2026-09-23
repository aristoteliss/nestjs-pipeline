# Task Context

## Task

Review the whole repository and remove unnecessary internal production-code complexity, especially in `packages/` and `ddd/`, without reducing features or breaking existing consumer usage.

## Goal

Leave less code to maintain and an implementation that is easier to understand. Preserve all existing functionality, supported inputs, public APIs, options, extension points and observable behavior. A reduction in line count alone is not success.

The production diff must be net negative in both real code lines and code characters. This applies to the proposed change or commit relative to its starting baseline; earlier committed savings cannot excuse new complexity. Count production code separately from tests, documentation, comments and formatting.

## Scope

- Review the repository broadly, including implementations across all packages and DDD areas; do not stop after a handful of convenient edits.
- Pay particular attention to `UsePipeline`, pipeline behaviors, domain entity decorators and persistence repository decorators.
- Simplify their internals while preserving their existing declaration syntax, supported options and consumer experience.
- Remove truly unnecessary work, duplicated implementation, redundant state and needless indirection where removal makes the remaining code clearer.
- Do not delete or weaken tests. Add or extend tests when needed to verify a meaningful compatibility risk.
- Preserve published APIs and reusable DDD contracts even when the example application does not use them. Local non-use does not establish redundancy.

## Current Status

Paused at the user's request after a verified pass. Nothing is committed. The working tree holds the uncommitted production changes listed below.

Baseline for this pass: `e7b005c7`. Its tree is identical to the former coverage commit `313b58b0`, so all earlier cleanup work is already committed there. Measure this pass against `e7b005c7`; earlier savings do not count.

## Decisions

- Rewrites are allowed only when they produce less real production code and fewer code characters without sacrificing clarity or functionality.
- Remove unnecessary things. Do not compress necessary things into clever code to satisfy a metric.
- Do not replace straightforward code with nested loops, indexed dispatch, dense expressions, long lines or additional abstractions merely to shorten it.
- Do not count removal of comments, blank lines or documentation as a production-code simplification. Do not move code elsewhere to disguise its cost.
- Keep `@Mutable<string>({ normalize: (value) => Role.normalizeName(value) })` and its options API. Do not introduce a shorthand decorator.
- Do not reintroduce the rejected nested ordering-rule loops over `['after', 'before']`. The `edges` list in `pipeline-contracts.ts` stays.
- Keep function descriptions that carry good explanations or examples. When merging or moving functions, carry their full JSDoc across. Do not shorten or drop useful docs. Rewriting past-tense history comments into current-state wording is allowed; keep their substance.
- Reject an extraction that adds lines or hides explicit logic behind a many-parameter helper. For example, `optimisticUpdate`/`optimisticDelete` keep their own affected-row checks; a seven-argument shared helper was tried and reverted.
- Do not force changes. Leave code alone when no clear, behavior-preserving simplification exists.
- Follow repository architecture rules. Preserve cache coordination, tenant and authorization boundaries, persistence acknowledgment, error behavior, lifecycle ordering and extension points.
- Do not commit unless requested. Do not stage files.

## Additional Requirements

- Cleanup is the primary objective. Coverage supports safe simplification and must not displace it.
- Foundational execution and context-propagation code needs focused regression tests and real Nest composition checks when changed.
- `@nestjs-pipeline/core` and `@nestjs-pipeline/correlation` enforce 100% statements, branches, functions and lines through `perFile` thresholds in their `vitest.config.ts`. They have no exclusions and no ignore directives. Both were already at 100% at baseline and remain so.
- Deprecated root-entity code may be removed only after contract and consumer-scope analysis. Root-entity getters and setters, including hydration accessors, stay.
- Test-only support belongs in tests. Do not add production seams for tests.
- Record new user requirements in this task and its reusable prompt as general rules.

## Measurement Method

Scope: `packages/*/src`, `ddd/core` and `ddd/users-api/src` `.ts` files, excluding `*.spec.ts`, `*.e2e-spec.ts`, `*.d.ts`, test and fixture directories, and vitest configs. Changed files come from `git diff --name-only e7b005c7` plus untracked files.

For each file, the baseline (`git show e7b005c7:<path>`) and the working copy are printed with `ts.createPrinter({ removeComments: true }).printFile(...)`. The printer reformats both sides the same way, so formatting and comments do not count. The script counts non-empty printed lines and non-whitespace characters.

A raw token-scanner approach was rejected: it misreads comments after template literals and inflated a moved JSDoc into +1,586 characters. Recreate the script in the session scratchpad; it is not kept in the repository.

Result for this pass: **-144 normalized code lines, -2,844 code characters**. Files that grew slightly: new internal helpers, `telemetry-attributes.ts`, `pipeline-plan.ts` (received `toGlobalConfigs`), `cache.behavior.ts` (+3 lines for `inScope`), `mikro-orm.cache.ts` (+1) and `policy-factory.ts` (+12 characters for the type import).

## Review Coverage (do not re-review unless the code changes)

Reviewed by reading the source myself:

- core `packages/pipeline/src`: `decorators/pipeline.decorator.ts`, `helpers/behavior-entries.ts`, `helpers/behavior-id.ts`, `services/pipeline-plan.ts`, `services/pipeline-contracts.ts`, `services/pipeline-runner.ts`, `services/pipeline.bootstrap.service.ts`, `pipeline.module.ts`, `pipeline.context.ts`, `pipeline-items.ts`, `constants/pipeline-context.constants.ts`, `behaviors/logging.behavior.ts`. `helpers/uuidv7.ts` was compared only.
- `ddd/core`: every domain file (`ApplyMutation`, `Mutable`, `root.entity`, `aggregate-root`, `root-domain.event`, `utils/uuidv7`) and every persistence file (`Cache`, `FromCache`, `persisted-write`, `acknowledge-persisted`, `map-persistence-errors`, the cache helpers, `filter-cache-key`, `memory.cache`, `optimistic-update`/`optimistic-delete`, `assert-autocommit`, `query-repository.abstract`, barrels), plus `application/command-base.handler.ts`.

Reviewed by read-only review agents, whose candidates I then verified against the source:

- cache, idempotency, rate-limit
- casl, zod, audit, deadletter
- opentelemetry, resilience, feature-flags, correlation
- `ddd/users-api/src` (all areas except `persistence/migrations`)

Packages reported clean: `pipeline-zod`, `pipeline-feature-flags`, `pipeline-rate-limit` (apart from its module export list).

Not reviewed yet: `ddd/users-api/src/persistence/migrations/*` (deliberately skipped), `packages/pipeline/src/options/*`, `helpers/safeStringify.ts`/`stableStringify.ts`/`key-segment.ts`/`logging.intent.ts` (the earlier pass cleaned `safeStringify`), `errors/`, `interfaces/`, `types/`. The `*.intent.ts` helpers in the other packages were only skimmed by agents.

## Applied Changes (uncommitted)

- `ddd/core/persistence/decorators/Cache.ts`: one options object replaces the two parallel positional/object normalization paths and six mutable variables. An `errorMessage()` helper replaces five copies of the same expression. Defaults, error messages and the `isNewer: null` handling are unchanged.
- `ddd/core/persistence/cache/memory.cache.ts`: `isExpired()` and `clearValue()` replace four copies of the expiry test and three copies of the value reset. `write()` builds one entry and either assigns it to the existing entry or inserts it. Revision order is unchanged.
- `ddd/core/domain/decorators/ApplyMutation.ts`: the intermediate `eventsToApply` array is gone. Every event is still validated before any is applied, and error messages are unchanged.
- `ddd/core/persistence/helpers/cache-version.helper.ts`: `new Date(x).getTime()` replaces the redundant `instanceof Date` branches.
- `ddd/core/persistence/helpers/cache-snapshot.helper.ts`: the null/object check is done once.
- `packages/pipeline/src/services/pipeline-contracts.ts`: removed the redundant `if (contract.order)` wrapper and the `result.length > 0` check.
- `packages/pipeline/src/behaviors/logging.behavior.ts`: `optionalParams` is sanitized once instead of in both branches. `optionalParamsOf()` merges `hasOptionalParams` and `extractOptionalParams` and keeps their full JSDoc. `excludeKeys` is now `new Set(options?.excludeKeys)`.
- `packages/pipeline/src/services/pipeline.bootstrap.service.ts`: removed the `currentTarget`, `currentMethodName` and `fallbackMethod` aliases in the scoped dispatcher. This is a pure rename.
- `packages/pipeline/src/services/pipeline-plan.ts` and `pipeline.module.ts`: `toGlobalConfigs` is defined once, in `pipeline-plan.ts`, which is not publicly exported.
- `packages/pipeline-correlation/src/middlewares/http-correlation.middleware.ts`: removed the `raw.length === 0` check, which `value.length === 0` already covers.
- `packages/pipeline-opentelemetry`: added a shared internal `helpers/safely.ts` (full doc kept). It replaces the duplicate `safely`/`logSafely` and restores `MetricsBehavior`'s JSDoc to the class. `withFactoryAttributes()` in `telemetry-attributes.ts` (not exported from `index.ts`) replaces the duplicated attribute-factory merge. `recordException` now has one call instead of two identical branches.
- `packages/pipeline-resilience`: `labels()` uses the existing `ResilienceRequestLabels` type. The `ResilienceBehavior` JSDoc moved from an internal interface onto the class. The history-narrative comments in `resilience-context.ts` and `policy-factory.ts` are rewritten in current-state terms.
- `packages/pipeline-cache/src/cache.behavior.ts` and `pipeline-idempotency/src/idempotency.behavior.ts`: one module-level `inScope()` per file replaces three copies each, and the private `inScope` method is gone. The two `key_reuse` throws in `replayOrConflict` are one condition.
- `packages/pipeline-idempotency/src/stores/memory.store.ts`: a private `write()` replaces three copies of the entry write.
- `packages/pipeline-casl/src/helpers/projection.ts`: `defineField()` replaces two identical `defineProperty` blocks.
- `packages/pipeline-deadletter/src/dead-letter.behavior.ts`: `shouldCapture` reuses `matchesIgnoredError`, with a guard that still skips invalid values silently.
- Dead-letter and audit Postgres writers: the `table` field used only in the constructor is now a local constant.
- `packages/pipeline-audit/src/audit.behavior.ts`: `reportFailure()` replaces three copies of the fail-open/fail-closed branch.
- `ddd/users-api`:
  - deleted the unreferenced `persistence/memory-store.ts` and `persistence/store.interface.ts`;
  - the new `persistence/persistence-entities.ts` replaces the duplicated 11-entity list in both option files (spread, so each ORM init still gets a fresh array);
  - removed the redundant `.map(normalizeSchemaName)` in `postgres-options.ts`;
  - removed the duplicate normalization in `User.create` and `Role.create` (`fromJSON` unchanged);
  - `MikroOrmCache.set()` serializes once;
  - the new `auths/services/first-header-value.ts` replaces two identical private methods.
- Test added: `pipeline.bootstrap.scoped-context.spec.ts`, "runs the original method through a dispatcher retained after every application is destroyed". No test was deleted or weakened.

## Rejected Candidates (already evaluated; do not re-evaluate)

- `optimisticUpdate`/`optimisticDelete` shared helper: adds lines and a seven-argument indirection. Reverted.
- `ddd/core/domain/utils/uuidv7.ts` duplicates core's `uuidv7`: intentional, because the domain layer imports no framework package.
- Bootstrap `typeof origGetInstance === 'function'` guards and the command/query/event loops: needed for mock wrappers, or rejected as indexed dispatch. The dispatcher's registry lookup is kept for re-registration semantics.
- `createPipelineRunner` `hasPipeline` parameter: needed for the scoped no-pipeline passthrough.
- `RootEntity.normalizeDate` and `from()`, `Mutable` owner check, `getMutableFields` `!fields` guard, `FromCache` runtime `keyFn` check, `map-persistence-errors` double trim: no meaningful gain, or a behavior risk.
- Idempotency/rate-limit module export constants, idempotency Postgres SQL column-list constant, `indexName` split, cache-key double trim, CASL base64 helpers, CASL `value === null` check, deadletter `!shouldCapture` condition, audit tenant-metadata helper, `untyped` copy in correlation, the rate-limit and idempotency partitioned-key merges (these would change keys), cache `buildKeyv`: too small, key-changing, or cross-package.
- users-api:
  - `sem` getter and `orm` field: tests read them.
  - `toCapability` versus `capabilityFromRow`: an empty `reason` would change from `''` to `undefined`.
  - `User.fromJSON`/`Role.fromJSON` normalization: would change error precedence and the missing-id message.
  - `MikroOrmCache` options parameter, `Capability.prefixKey`, `tenant-orms` `parseSchemas`: behavior differences or a supported cache-prefix convention.
  - `signToken` `userId`: needs a test change.
  - Filter write-out helper and `jwt` `exp` check: low value.
- Test-only production surface reported in users-api, left for an owner decision: `GetRolesCapabilitiesQuery` and its handler/repository, `withFork()`, `Capability.create`/`fromJSON`, processor aliases, the test exports in `user-overview-cache.policy.ts`, and the `RequestPrincipalResolver` default `new SessionService()`.

## Findings Outside Cleanup Scope

- Code-path inference, not reproduced: `PostgresIdempotencyStore.set()` binds the TTL in milliseconds (`$10`) directly to `expires_at TIMESTAMPTZ`. `setIfAbsent` and `completeIfOwned` use `now() + ($10 || ' milliseconds')::interval`. This predates `757e9e25`. The spec mocks `query`, so it does not catch this. Fixing it is a bug fix; it needs a user decision.
- The `PostgresIdempotencyStore` class JSDoc sits above the `assertLeaseTtl` comment, so the class has no doc comment of its own. This was not fixed.

## Tests and Verification (this pass, final sources)

- Per-package tests passed after each change. `pnpm test`: 2,475 tests passed across all workspaces (core 324, ddd-core 406, users-api 761).
- Core and correlation coverage: 100% on all four metrics (core 651/559/107/601, correlation 82/78/25/78).
- `pnpm lint`, `pnpm check`, `pnpm lint:persistence` and `git diff --check`: passed.
- `pnpm test:release`: passed for all 12 packed packages, including the core lifecycle and CASL contracts.
- Not run yet: `pnpm test:e2e` (needs Docker), `pnpm context:check`/`context:validate`.

## Next Steps

1. Run `pnpm test:e2e` (Docker) for real Nest composition of the bootstrap rename, the users-api persistence options and the `ddd/core` decorators.
2. Run `pnpm context:check`. The users-api file additions and deletions may need `pnpm context:update` and `pnpm context:validate`; mention any map change.
3. Optionally review the unreviewed areas listed above.
4. Ask the user about the Postgres `set()` defect and the test-only users-api surface.
5. Report to the user; do not commit unless asked.

## Snapshot Impact

No architectural contract changes. The file layout in `ddd/users-api/src/persistence` and `auths/services` changed, so the codebase map may need regeneration.

## Reusable Prompt

Review the whole repository, especially `packages/` and `ddd/`, and remove unnecessary internal code and complexity. Give particular attention to `UsePipeline`, pipeline behaviors, domain entity decorators and persistence repository decorators.

Preserve every existing feature, supported input, option, public API, extension point and consumer usage. Simplify the implementation behind the existing APIs; do not require callers to change their code only to simple api but with same or better functionality and extentability. Do not remove a reusable feature just because the example application does not use it.

Rewrites are allowed, but the final production diff must have fewer real code lines AND fewer code characters than the starting baseline. This is a constraint, not the objective: the objective is less unnecessary code and a clearer implementation. Do not cheat through formatting, long lines, dense expressions, extra nesting, shorthand APIs, moving code or counting comment/documentation deletions as code reductions. Do not delete or weaken tests.

Remove genuinely redundant work, duplicated implementation, unnecessary state and needless indirection. Do not replace simple explicit code with clever or more complicated code merely to make it shorter. In particular, do not reintroduce the rejected nested ordering-rule loops or replace the existing Mutable options API with a shorthand decorator.

Review broadly and keep an honest record of the areas inspected. Do not stop after a few convenient edits and claim the repository is clean. Equally, do not force changes where there is no justified simplification: leave that code alone.

Cleanup remains the primary objective. Use coverage to verify safe simplification; do not let coverage work expand into a separate project or displace removal of unnecessary complexity. Keep tests focused on meaningful behavior and affected contracts.

Treat foundational execution and context propagation as critical code. Add focused regression tests for changes to bootstrap, handler wrapping, dependency lifecycles, ordering and context ownership, and verify real Nest composition where applicable. Bring `@nestjs-pipeline/core` and `@nestjs-pipeline/correlation` to enforced 100% statements, branches, functions and lines across production source. Achieve coverage through meaningful behavior tests, without production exclusions, coverage-ignore directives, weakened assertions or test-only production seams.

You may remove deprecated root-entity code when a documented contract and consumer-scope review establishes that it is obsolete. Do not remove root-entity getters or setters, including hydration accessors. Neither a deprecation label nor missing local usage alone justifies removing a reusable feature.

Keep function descriptions that carry good explanations or examples; when merging or moving functions, carry their full documentation across.

Keep test-only code in tests. Production code must serve runtime behavior or a supported consumer contract. Do not add or retain production exports, parameters, branches, injection seams or state solely to help tests access internals or satisfy coverage. Verify consumer scope before moving existing support code into tests.

Keep this task and reusable prompt synchronized with new requirements and corrections, expressed as general rules rather than conversational history.

Before each change, establish why the code is unnecessary and how existing behavior will be preserved. Follow repository instructions, verify the affected contracts with appropriate tests and checks, and measure production lines and characters separately from tests and documentation. Report what was actually removed, why the remaining implementation is simpler, what passed verification and what remains unverified. Do not commit unless I ask.

## Last Updated

2026-09-23
