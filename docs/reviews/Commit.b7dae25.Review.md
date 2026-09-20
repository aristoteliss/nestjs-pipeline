# Review: b7dae25fda1cf090a52ab2ab79196097f3116260

Reviewed against its parent, with HEAD at the reviewed commit and a clean working tree. Scope includes correctness, duplication, design, tests, and compliance with `AGENTS.md` and `.agents/skills/nestjs-pipeline-architecture/SKILL.md`.

**Recommendation: revise before merging.** The addon-owned contract mechanism is a good architectural fit, but bootstrap does not inspect the same configuration that execution uses. Four correctness gaps are reproduced below. The implementation also needs consumer documentation and consolidation of duplicated policy validation.

## Correctness findings

### 1. [P2] Bootstrap omits addon module defaults

Location: `packages/pipeline/src/services/pipeline.bootstrap.service.ts:473–481`, especially `effectiveOptions: mergedOptions.get(id)`.

`mergedOptions` contains pipeline-global and handler options. At runtime, all five addons also merge their injected module defaults beneath those options. Static contracts cannot see that third configuration source.

Reproduced through a compiled Nest application:

```ts
RateLimitModule.forRoot({
  limiter,
  defaults: { keyFactory: () => 'valid' },
});

@UsePipeline(RateLimitBehavior)
```

Strict bootstrap rejects this valid configuration as missing `keyFactory`. Cache, idempotency, and feature flags have the same structural problem. Resilience has the inverse failure: `ResilienceModule.forRoot({ retry: { maxAttempts: 2 } })` plus a bare local `ResilienceBehavior` passes bootstrap, then the first command throws `ResilienceConfigurationError`. Supplying an error classifier through module defaults can also produce false bootstrap failures when retry options are local.

**Required solution:** let an addon resolve its actual defaults for validation through a production-facing instance contract or an addon-provided validator that participates in DI. Share its option merge with execution. Core must not import addon option tokens or inspect private fields. Preserve precedence: addon defaults, pipeline-global options, handler options. Retain runtime guards for dynamic conditions and diagnostics-off mode.

**Acceptance tests:** real addon modules with defaults-only activation fields, local overrides, valid resilience defaults, and unsafe resilience defaults. Validate through `app.init()` and CQRS dispatch.

### 2. [P2] Ordering constraints reject statically inactive behaviors

Locations: `packages/pipeline-cache/src/cache.behavior.ts:84–96`, `packages/pipeline-idempotency/src/idempotency.behavior.ts:114–125`, and the unconditional order check at `packages/pipeline/src/services/pipeline.bootstrap.service.ts:428–469`.

`@UsePipeline(CacheBehavior, CaslBehavior)` on a command fails bootstrap although cache defaults to queries and immediately calls `next()` for commands. The options validator checks request kind, but the ordering engine runs before and independently of that check. Idempotency has the corresponding problem for requests outside its configured scope. Global declarations can therefore block unrelated handlers despite having no short-circuit behavior there.

**Required solution:** evaluate hard ordering edges using the resolved request kind and options. An addon can return applicable edges from its validation result or expose a context-aware ordering contract. Do not evaluate request-dependent conditions at bootstrap, and continue requiring safe order whenever short-circuiting is possible.

**Acceptance tests:** cache-before-CASL passes on an excluded command, fails on an enabled query, and fails on a command explicitly included in `kinds`. Cover idempotency scope similarly.

### 3. [P2] Global cache/rate-limit declarations are incorrectly assumed passive

Locations: `packages/pipeline-cache/src/cache.behavior.ts:99–102` and `packages/pipeline-rate-limit/src/rate-limit.behavior.ts:96–99`.

The new validators exempt all global-only declarations from missing-key diagnostics. This matches idempotency's pass-through behavior, but not cache or rate limiting. Cache throws for an applicable query without a key; rate limiting also requires a key factory at execution.

Reproduced with a global `CacheBehavior` on queries and `CacheModule.forRoot()` without defaults: strict bootstrap succeeds, but the first query throws the missing-key error. The synthetic passive behavior in the core tests does not exercise the real cache semantics.

**Required solution:** determine passivity from each addon's actual execution contract, not declaration source alone. For active cache/rate-limit declarations, diagnose missing effective keys regardless of source. Preserve genuine pass-through for idempotency and other addons that support it. Making cache/rate-limit globally passive instead would be a separate behavior change requiring an explicit decision, documentation, and tests.

**Acceptance tests:** real global cache and rate-limit modules with and without keys, plus genuine passive idempotency, feature-flag, and resilience configurations.

### 4. [P2] Factory validation accepts non-callable values

Locations: `packages/pipeline-cache/src/cache.behavior.ts:102`, `packages/pipeline-rate-limit/src/rate-limit.behavior.ts:99`, and `packages/pipeline-idempotency/src/idempotency.behavior.ts:132`.

The contracts check truthiness rather than whether the activation field is a function. A JavaScript consumer using `{ key: 'invalid' }` passes strict bootstrap and fails on its first query with `options.key is not a function`. This is a deterministic error in the JavaScript/dynamic-configuration use cases that S-15 explicitly targets.

**Required solution:** validate `typeof key === 'function'` and `typeof keyFactory === 'function'` after resolving effective options. Do not invoke factories during bootstrap: their output depends on request context.

**Acceptance tests:** truthy strings and objects are rejected at bootstrap; valid functions are accepted without being called.

## Design and duplication improvements

### Share resilience safety rules between bootstrap and execution

`packages/pipeline-resilience/src/resilience.behavior.ts:78–105` repeats the predicates and explanations in `assertSafeConfiguration()` at lines 190–214. These represent the same safety policy and can drift independently.

Use one non-exported pure helper in the resilience package to return configuration issues from resolved options and request kind. Bootstrap converts those issues to diagnostics; execution converts them to the existing runtime error. Preserve runtime error behavior. The helper serves two production paths; do not export it to make tests reach it. This follows repository rule 18.

### Extract the diagnostics traversal from handler wrapping

`wrapIfDecorated()` now also owns contract discovery, source classification, order matching, message formatting, and validation invocation. Move that traversal into a private method or internal production module. Pass the effective handler configuration to it.

The `before` and `after` branches duplicate target lookup, identity matching, and diagnostic creation. Normalize edges and process them with one matcher and direction-dependent comparison. Avoid introducing a generic validation framework merely to eliminate a few similar object literals across addons; addon-specific policy should remain addon-owned.

### Prefer stable behavior IDs for built-in cross-package edges

The built-in edge uses the display name `'CaslBehavior'`, and core matches `b.name` as well as identity. This can match unrelated same-named custom behaviors and is fragile under constructor renaming. The repository already provides `PIPELINE_BEHAVIOR_ID` to distinguish identity from display names.

Use a documented namespaced identity for the built-in CASL behavior and its ordering references, without importing CASL into core. Preserve and document class-name targeting if it remains a supported custom-contract feature. Test unrelated same-named classes and explicit IDs. This is a design improvement, separate from the reproduced failures above.

### Test real configuration boundaries

The new users-api integration suite is correctly located outside published packages. However, mocked cache/idempotency instances omit the module defaults and activation semantics responsible for the findings. Keep focused core tests for contract traversal, but add real-module coverage in users-api.

Also cover global/local option merging, skipped behaviors, `order.before`, scoped handlers, and multiple collected diagnostics. In the core spec, capture a thrown error from one bootstrap invocation rather than bootstrapping twice solely to inspect the same exception. Parameterize repeated mode/configuration setup where it makes cases clearer.

## Repository instruction alignment

Aligned:

- Core imports no addon implementation; optional contracts are owned by addons.
- No ORM, HTTP exception, or business-handler boundary violation is introduced.
- Nest integration tests are in users-api; no published-package dependency on `@nestjs/testing` is added.
- No test-only production export, parameter, or process-global observation state is introduced.
- Existing private CQRS discovery coupling is reused rather than expanded to another framework API.

Incomplete:

- No package README documents `diagnostics`, `PIPELINE_BEHAVIOR_CONTRACT`, or `PipelineConfigurationError`. The default strict mode changes startup behavior, so inline JSDoc and an implementation-status entry are insufficient under the repository's consumer-documentation rule.
- Add core README guidance for strict/warn/off, aggregation, custom contracts, ordering identity, option precedence, and the limits of bootstrap validation. Add relevant activation/defaults guidance to addon READMEs. Explain that ordering CASL before a short-circuit does not replace entity authorization or secure cache-key partitioning.
- Keep consumer documentation about current contracts. Remove the implementation-ticket marker from the new production diagnostics comment; review history belongs in review documents and Git.
- The S-15 completion claim in the review tracker should be reconsidered until the effective-configuration and activation gaps are covered.

## Recommended implementation sequence

1. Define addon-aware effective-option resolution without coupling core to addons.
2. Reuse option resolution and resilience safety predicates between bootstrap and runtime.
3. Make order applicability and passive/active checks agree with runtime behavior.
4. Validate callable activation fields and consolidate the ordering traversal.
5. Add real-module regressions in users-api and update package READMEs.

## Verification

- Builds passed for core, cache, idempotency, rate-limit, feature-flags, and resilience.
- Existing test commands passed for all six affected packages.
- Direct users-api diagnostics suite passed: 7 tests.
- `pnpm check` and `pnpm lint:persistence` passed on the reviewed source, each checking 649 files.
- Compiled Nest application probes reproduced all four findings, including both directions of the defaults mismatch. Probes used public module configuration, `app.init()`, and CQRS dispatch; no production seam was added.
- An initial users-api invocation inadvertently ran the whole unit suite: 481 tests passed and 10 HTTP integration tests failed with sandbox `listen EPERM`. Those environmental failures are not attributed to this commit. The diagnostics suite was subsequently run directly and passed.
- No implementation source was changed by this review. A concurrent working-tree edit removed three diagnostics comments from `pipeline.bootstrap.service.ts`; it does not change the findings. Line references and conclusions above describe the requested commit. This review document is the only file added by the reviewer.
