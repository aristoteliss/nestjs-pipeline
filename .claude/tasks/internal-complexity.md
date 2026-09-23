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

On hold, waiting for the user to pick the next backlog item. Work since `705905ba` (the architecture pass, the idempotency `set()` fix and the test-only code move) is verified and **uncommitted**. Commit only when asked.

## On-Hold Backlog (do after, in this order; each item needs the user's go-ahead)

1. **Commit and release hygiene.**
   - Commit the current working tree when asked.
   - Bump `@nestjs-pipeline/idempotency` at least a patch version: the `set()` expiry fix changes runtime behavior.
   - Add a changelog; none exists.
   - Confirm the published versions on npm. `npm view` output was drowned by the `link-workspace-packages` config warning, so check again or silence the warning.
   - Publish only from a commit that contains the `set()` fix.
2. **Move generic persistence code from users-api into `ddd/core`** (prerequisite for publishing it):
   - `ddd/users-api/src/persistence/is-transient-persistence-error.ts` (`isTransientPersistenceError`, `mapPersistenceError`) → `ddd/core/persistence`. The `ddd/core` docs already reference `mapPersistenceError`.
   - `ddd/users-api/src/persistence/mikro-orm-write-side.command-repository.ts` → `ddd/core/persistence`, behind an `{ em }` store port instead of `MikroOrmStore`.
   - Replace users-api's own `MissingTenantContextError` (`common/cqrs/helpers/requireTenantId.helper.ts`, extends `Error`) with `ddd/core`'s (extends `DomainException`). First decide the intended HTTP mapping, because the two map differently.
   - Optional, decide separately:
     - `MikroOrmCache` plus `CacheEntry` as a MikroORM `IVersionedCache` adapter (needs a table/schema story for consumers);
     - `rootEntityProperties`/`versionProperty` with configurable column names;
     - `DomainExceptionFilter` as an optional presentation entry point.
3. **Make `ddd/core` publishable** (user leaning yes; recommendation about 65/35 for an experimental 0.x):
   - Move it to `packages/ddd-core`, or extend `copy-licenses`, `test:release`, the Grit package rules and `publish:all` to cover it.
   - `package.json`:
     - remove `private`;
     - make `@nestjs-pipeline/core`, `@nestjs/common` and `@nestjs/cqrs` peer dependencies;
     - drop the unused `@nestjs-pipeline/correlation` dependency;
     - add `files`, `publishConfig`, the license files and `repository`;
     - rewrite the description, which currently says "for the sample applications".
   - Enforce 100% coverage thresholds like core. Add release consumer checks per entry point; `/domain` and `/application` must load without MikroORM.
   - Keep the repo-policy Grit specs (`biome-*-plugin.spec.ts`) out of the published package (P-09).
   - Make the README a consumer manual.
4. **Remaining review coverage** (not yet reviewed for simplification):
   - `packages/pipeline/src/options/`, `interfaces/`, `errors/`, `types/`;
   - `helpers/stableStringify.ts`, `key-segment.ts`, `logging.intent.ts`;
   - the `*.intent.ts` helpers in the other packages (only skimmed);
   - users-api migrations (deliberately skipped).
5. **Small doc fix:** the `PostgresIdempotencyStore` class JSDoc sits above the `assertLeaseTtl` comment, so the class has no doc comment of its own.
6. **Open review findings outside the published packages, not re-verified this session:**
   - I-01: create → delete → create within 24h replays the old response;
   - O-06: signal listeners do not close the app;
   - U-01: the shared demo login code;
   - RL-01/RL-02: users-api rate-limit dimensions and deployment;
   - AU-06: audit coverage;
   - U-03: auth services layering.

   Check each against the current code before acting.
7. **Only if the user asks:**
   - users-api repository-per-operation consolidation (one command repository per aggregate). This changes the documented positive-example pattern and the Grit rules.
   - Behavior-module factory in core: about 70 net lines, but a new public core API and a peer-version bump. Recommended against.

Closed decisions (do not reopen): keep `setCorrelationFallback`; keep the production functions exported for specs; keep the processor alias names; U-05 cache-key object, Z-06 mapper pipe, AU-01 bootstrap move and shared delete-retry policy are rejected.

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
- Architecture-level changes are allowed when they measurably simplify the code: fewer production lines and characters, fewer duplicated mechanisms or concepts. They must follow the same rules as local cleanups: preserve features, public APIs, options, extension points and consumer usage, and record each change's measured benefit. Structural change without a measured simplification is not a goal.

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

## Architecture Pass (baseline `705905ba`, uncommitted)

Method: a clone scan of production files (repeated windows of six or more normalized lines, excluding imports and punctuation), then the open "architectural simplification" priorities in `docs/reviews/Architecture.Review.el.md` (P-02, AU-01, Z-06, U-05, O-04, C-04, X-02). Measured with the printer-based method: **-43 lines, -425 characters**.

Applied:
- `ddd/users-api/src/persistence/schemas/root-entity.properties.ts`: `rootEntityProperties()` and `versionProperty()` replace the identity, timestamp and version columns copied into the auth, role, user and capability schemas. The factories return fresh objects, and property order is unchanged. Result: -58 lines in schemas, +25 in the new file.
- `ddd/core/application/request-fields.helper.ts` (not in the barrel): `defineHidden()` and `definedFields()` replace the duplicated hidden-property setup (four copies) and `toJSON()` in `BaseCommand` and `BaseQuery`. Class hierarchy and public API are unchanged.
- `MikroOrmCache`: `readCommittedEntry()` names the identity-map-bypassing CAS read that was repeated five times. Size-neutral after normalization (+4 lines, -25 characters); kept because it gives the rule-17 invariant one named home. `readState` keeps its own read without `refresh`.
- `@nestjs-pipeline/correlation` imports `untyped` from core (C-04) instead of keeping a copy, and keeps its own `dyn`. Coverage is still 100%.

Scope for further architecture work: the published `packages/*` and core (`@nestjs-pipeline/core`, `ddd/core`). The users-api structure (for example, one repository per operation) is out of scope unless the user asks.

Evaluated and rejected (do not re-evaluate):
- A shared base for the three `Missing*PartitionError` classes: these are public classes with distinct names and messages, and a base would save about five lines each while adding a core export.
- A shared core helper for the partitioned-key tenant check: about eight lines each, and it would need a new public API.
- `*.intent.ts` helpers: already one-line public functions.
- AU-01 was already consolidated to a single loop. Moving it to bootstrap would turn `failOpen` warnings into startup failures.
- U-05: a per-aggregate cache-key object would add lines (the new file costs more than the call sites save); its benefit is consistency only.
- Z-06 is mostly resolved. Removing the mapper `.pipe(UpdateUserCommand.schema)` would change the error type.
- A shared retry policy for the two delete handlers: per-use-case policy, only two uses.
- Handler and repository decorator configurations: declarative per use case and checked by the Grit plugin.
- `ddd/core` domain `uuidv7`: deliberate domain isolation.
- O-04 typed item wrappers: additive, not a reduction.
- Already done earlier: P-02 (`IPipelineBehaviorOptionsResolver` exists).

Further packages/core architecture review (normalized-size ranking plus cross-package mechanisms):
- Serializers: audit `json.ts` is a tagged storage format (`$type`) persisted by the Postgres sink, distinct from core `safeStringify` (logs) and `stableStringify` (keys); merging would change stored records. Idempotency and dead-letter already reuse core (`toStrictJsonValue`, `stableStringify`, `redactValue`).
- Audit and dead-letter record builders: different contracts (DL-01); only a tiny metadata merge overlaps.
- Postgres identifier guard (audit, dead-letter): about 10 lines each. A shared version would put SQL helpers into core's public API. Not done.
- Behavior modules (audit, rate-limit, idempotency, dead-letter; similar in cache and feature-flags): the same shape (behavior + backend token as value or factory + defaults token, `forRoot`/`forRootAsync`). A core module factory is estimated at about 110 lines saved in packages minus about 35 in core, so about 70 net. It needs a new public core export and a peer-version bump, hides the Nest provider graph, and DL-01 advises against it without a proven maintenance benefit. Awaiting the user's decision; not implemented.
- Bootstrap scoped multi-application machinery, correlation's two ID sources (C-01), barrier and revision coexistence (D-02, rule 18), and `@Cache`/`@FromCache` positional overloads: supported contracts; not candidates.

Verified on final sources: `pnpm test` (2,475), `pnpm lint`, `pnpm check`, `pnpm lint:persistence`, `git diff --check`, `pnpm test:e2e` (163 tests in 30 files, with Docker), `pnpm test:release` (12 packages), and `pnpm context:update` plus `context:validate`.

## Defect Fix and Test-Only Code Move (baseline `705905ba`, uncommitted)

Defect fix (reproduced, then fixed):
- `PostgresIdempotencyStore.set()` bound the TTL in milliseconds to `expires_at TIMESTAMPTZ`. Real Postgres rejected it with `invalid input syntax for type timestamp with time zone: "60000"`. It now uses `now() + ($10 || ' milliseconds')::interval`, like the claim and completion writes.
- Regression test: `ddd/users-api/test/postgres-idempotency-store.e2e-spec.ts` (Testcontainers Postgres). It failed before the fix and passes after. The package unit spec also asserts the `set()` expiry expression and parameter.

Test-only production code moved or removed (users-api):
- The `GetRolesCapabilitiesQuery`, handler, repository and `RoleDefinition` moved to `test/support/roles-capabilities/`, together with a local repository token. The module registration and the `QUERY_REPOSITORY.getRolesCapabilities` token were removed. The repository spec moved to `test/`. `casl-permission-source.e2e-spec.ts` keeps its "no per-request role query" spies, pointing at the moved class.
- `SYSTEM_ROLES` moved into `test/role-provider-persistence.spec.ts` (the migration keeps its own copy). The unused `SystemRole` type and `roles.constants.ts` were deleted.
- `withFork()` was removed from both stores. Its spec now asserts the same dedicated, untagged fork through `transactional()`.
- `Capability.create`/`fromJSON` were removed. Specs use the public constructor, which applies the same normalization.
- The `sem` getters were removed from both stores. The store-context spec reads `em` twice to assert fresh forks.
- `MikroOrmStore.orm` was removed: production wrote it and nothing read it.
- The `ILoginCodeVerifier.verify` string overload was removed. The two assertions that covered only that overload were dropped; the object-form assertions for the same codes remain.
- The `RequestPrincipalResolver` constructor default `new SessionService()` was removed; specs pass an instance.

Not moved (user decided to keep them as they are; do not propose again):
- `setCorrelationFallback` and its state in `@nestjs-pipeline/correlation`: `@internal`, not exported from `index.ts`, and set only by tests. It is not movable; removal deletes the hook and its two tests.
- Production functions exported only so that specs can import them (they are used in production within their own file, so the code cannot move). Removing each export means rewriting the tests to go through the real entry point:
  - users-api: `createAuthRateLimitKey`, `refreshAuthRateLimitKey`, `createRoleIdempotencyKey`, `createUserRateLimitKey`, `createUserReplayScope`, `sessionAuditActor`, `UNAUTHENTICATED_AUDIT_ACTOR`, the five `user-overview-cache.policy.ts` exports, `resolveBatchTenant`, `MixedTenantBatchError`, `BatchUpdateUserItem`, `MissingPrincipalContextError`, `HTTP_LOG_REDACT_PATHS`, `isTransientPersistenceError`, and the CLI functions `purgeSessions`, `verifyUserPermissions` and `revert`;
  - zod: `deepEqual` and `cloneData`.
- Processor aliases `BatchUpdateUsersProcessor`/`SendWelcomeEmailProcessor`: production registers them, so they are not test-only. They are a second name for each class.
- Inventory limitation: exported top-level names were checked by script. Class members were checked only for the items listed above.

Measured against `705905ba` (architecture pass included): **-174 normalized lines, -4,964 code characters**.

Verified: `pnpm test` (2,475), `pnpm lint`, `pnpm check`, `pnpm lint:persistence`, `git diff --check`, `pnpm test:e2e` (165 tests in 31 files), `pnpm test:release` (12 packages), and `pnpm context:update` plus `context:validate`.

## Proposal: publish `ddd/core` (advice only, nothing changed)

Generic code in users-api that belongs in `ddd/core`:
- `persistence/is-transient-persistence-error.ts` (`isTransientPersistenceError`, `mapPersistenceError`). `ddd/core` docs already name `mapPersistenceError` as the canonical `otherwise` translator.
- `persistence/mikro-orm-write-side.command-repository.ts`: the rule-18 authoritative write-side base. It needs an `{ em }` store port instead of `MikroOrmStore`.
- `common/cqrs/helpers/requireTenantId.helper.ts` redefines `MissingTenantContextError` (extends `Error`), which differs from `ddd/core`'s class (extends `DomainException`).
- Possible: `MikroOrmCache` plus `CacheEntry` (a MikroORM `IVersionedCache` adapter), `rootEntityProperties`/`versionProperty` (with configurable column names), and `DomainExceptionFilter` as an optional presentation entry.
- Stay in users-api: the idempotent-operation, read-freshness and session helpers, the tenant EM registry and resolver, and `createMapper` (which, if shared at all, belongs in pipeline-zod).

Restructure needed to publish `ddd/core`:
- Move it to `packages/ddd-core`, or extend `copy-licenses`, `test:release`, the Grit package rules and `publish:all`.
- `package.json`:
  - remove `private`;
  - make `@nestjs-pipeline/core`, `@nestjs/common` and `@nestjs/cqrs` peers;
  - drop the unused `@nestjs-pipeline/correlation` dependency;
  - add `files`, the license files and `publishConfig`;
  - rewrite the description, which currently says "for the sample applications".
- Enforce coverage thresholds like core.
- Add pack and consumer checks per entry point, including `/domain` and `/application` without MikroORM installed.
- Keep the repo-policy Grit specs out of the published package (P-09).
- Resolve the tenant error duplicate and move the generic persistence helpers listed above.

## Tests and Verification (first pass, final sources)

- Per-package tests passed after each change. `pnpm test`: 2,475 tests passed across all workspaces (core 324, ddd-core 406, users-api 761).
- Core and correlation coverage: 100% on all four metrics (core 651/559/107/601, correlation 82/78/25/78).
- `pnpm lint`, `pnpm check`, `pnpm lint:persistence` and `git diff --check`: passed.
- `pnpm test:release`: passed for all 12 packed packages, including the core lifecycle and CASL contracts.
- `pnpm test:e2e`: all 163 tests in 30 files passed with Docker running.
- `pnpm context:update` regenerated only the generated map sections (file counts, the commit, one env var name). `pnpm context:validate`: 58 checks passed, with the existing map-size warning.

## Next Steps

User decisions:
- Fix the `PostgresIdempotencyStore.set()` expiry defect, with a regression test against real Postgres.
- Move every production part used only by tests into test code (users-api and packages), updating the tests without weakening them.
- Behavior-module factory in core: offered and recommended against; not requested.
- Keep `setCorrelationFallback`, and keep the production functions exported for specs. Do not remove or un-export them.


1. Wait for the user to choose from the On-Hold Backlog. Do not start any item without the go-ahead.

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

Architecture-level changes are allowed when they deliver a measured simplification (less production code and fewer duplicated mechanisms) under the same preservation rules; record the measured benefit of each.

Keep test-only code in tests. Production code must serve runtime behavior or a supported consumer contract. Do not add or retain production exports, parameters, branches, injection seams or state solely to help tests access internals or satisfy coverage. Verify consumer scope before moving existing support code into tests.

Keep this task and reusable prompt synchronized with new requirements and corrections, expressed as general rules rather than conversational history.

Before each change, establish why the code is unnecessary and how existing behavior will be preserved. Follow repository instructions, verify the affected contracts with appropriate tests and checks, and measure production lines and characters separately from tests and documentation. Report what was actually removed, why the remaining implementation is simpler, what passed verification and what remains unverified. Do not commit unless I ask.

## Last Updated

2026-09-23
