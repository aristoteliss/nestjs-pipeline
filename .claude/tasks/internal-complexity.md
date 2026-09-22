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

In progress. The user requested a pause to rewrite these requirements, then explicitly asked to continue. Implementation has resumed under the requirements below.

The last accepted work is committed in `09c7775d6209b80dd5e06e4c2cb580ef6353f301`. The rejected continuation was fully reverted before this task-file rewrite. The working tree was clean at that point. The current continuation uses that commit as its baseline.

## Decisions

- Rewrites are allowed; the user clarified that literal deletion-only editing is not required. Rewrites must produce less real production code and fewer code characters without sacrificing clarity or functionality.
- Remove unnecessary things. Do not compress necessary things into clever code to satisfy a metric.
- Do not replace straightforward code with nested loops, indexed dispatch, dense expressions, long lines or additional abstractions merely to shorten it.
- Do not count removal of comments, blank lines or documentation as a production-code simplification. Do not move code elsewhere to disguise its cost.
- Do not change `@Mutable<string>({ normalize: (value) => Role.normalizeName(value) })` to `@Mutable(Role.normalizeName)` as a cleanup strategy. Shorthand syntax is not removal of internal complexity, and existing options and usage must remain supported.
- The proposed ordering-rule rewrite using nested loops over `['after', 'before']` was explicitly rejected. It removed an intermediate list but made the validation harder to follow. It has been reverted and must not be reintroduced as a line-count saving.
- Do not force changes into every file. Review broadly, but leave implementations alone when no clear, behavior-preserving simplification is justified.
- Do not describe a narrow patch or automated inventory as a completed repository-wide cleanup. Report actual coverage and remaining work honestly.
- Follow repository architecture rules. Preserve cache coordination, tenant and authorization boundaries, persistence acknowledgment, error behavior, lifecycle ordering and supported extension points.
- Do not commit unless requested. Any proposed cleanup commit must satisfy the negative production-line and character requirements.

## Additional Requirements

- Cleanup is the primary objective. Coverage supports safe simplification; it must not become an independent expansion of scope or displace repository cleanup. Keep tests focused on contracts, meaningful edge cases and the affected critical paths.

- Foundational execution and context-propagation code requires especially strong verification. Changes to pipeline bootstrap, provider lifecycle, handler wrapping, ordering or context ownership must have focused regression tests and real Nest composition tests where applicable.
- `@nestjs-pipeline/core` and `@nestjs-pipeline/correlation` must reach and enforce 100% statements, branches, functions and lines over their production source. Exercise observable behavior with meaningful assertions. Do not exclude production files, add coverage-ignore directives, weaken tests or expose production internals merely to reach a percentage. If a branch is truly unreachable or obsolete, establish that independently before removing it.
- Deprecated root-entity code may be removed when current contracts, implementation and consumer-scope analysis justify that it is obsolete. Deprecation alone or absence of a local caller is insufficient. This permission does not extend to root-entity getters or setters, including hydration accessors; retain them and their behavior.
- Test-only fixtures, mocks, setup, assertions and access helpers belong in test code. Do not add or retain production exports, parameters, branches, injectable seams or state solely for tests. Move existing test-only support out of production only after verifying that real consumers do not depend on it.
- Record new user requirements and corrections in this task and its reusable prompt as general, actionable rules. Preserve user edits and reconcile additions with the existing constraints.

## Plan

When the user resumes the task:

- [x] Verify the working tree and establish the current baseline without overwriting user changes.
- [ ] Review implementations across packages and DDD areas, recording areas inspected and substantive candidates. A file inventory is only an index, not proof of a completed review.
- [ ] For each candidate, identify what is unnecessary, why it can be removed and which contracts must remain intact.
- [ ] Reject candidates that merely shorten syntax, add nesting or obscure control flow.
- [ ] Implement justified reductions and inspect the resulting code for readability.
- [x] Verify this pass with unit tests, typechecks, formatting, packed consumers and Docker-backed application integration. Repeat relevant checks if further production changes are made.
- [x] Measure this pass against the baseline, separately from tests and documentation. Recalculate if further production changes are made.
- [ ] Report concrete removals, review coverage, verification results and remaining limitations.

## Modified Files

Current production changes:

- `packages/pipeline/src/helpers/safeStringify.ts`: one property-copying implementation for errors and ordinary objects, preserving redaction, exclusions, descriptors, symbols and cycle handling; one exclusion-option parsing path.
- `packages/pipeline-idempotency/src/stores/postgres.store.ts`: reuse the existing record parameter serializer for claim, completion and unconditional writes. SQL statements and ownership checks are unchanged.
- `ddd/core/domain/events/root-domain.event.ts`: share the identical mutator-blocking operation for frozen Date, Map and Set copies. Type-specific cloning and public behavior remain intact.
- `ddd/users-api/src/common/filters/domain-exception.filter.ts`: remove the EmptyUserUpdateException branch that returned exactly the fallback response.
- `packages/pipeline-feature-flags/src/feature-flag.behavior.ts`: remove repeated flag validation already covered by the preceding check and duplicate enabled/disabled logging.

Tests add coverage for property-copying edge cases and full SQL parameter order. The existing migration test is formatted to satisfy Biome; no tests are deleted or weakened.

Measured against `09c7775d`: 59 fewer normalized, comment-free production code lines; 1,147 fewer non-whitespace code characters; 1,859 fewer total production source characters. Every changed production file is smaller by all three measures.

Review coverage: structural scans covered 361 production TypeScript files (all 12 packages, ddd/core and ddd/users-api). Targeted source review covered pipeline declarations/planning, sanitization/logging, feature flags, telemetry, resilience, audit/dead-letter records, CASL projection/interpolation, idempotency stores, cache factories/adapters, DDD mutation and persistence decorators, aggregates/events, ORM caches/stores, permission projection, authenticators and HTTP/session mapping. This is not a claim that every source file has been manually reviewed.

Retained candidates: independently owned package helpers, rich-type cloning/provenance checks, cache revision and ownership state, separate repository/pipeline caching, public aggregate accessors, and ordinary business handlers. Removal was not justified by duplication alone.

## Tests and Verification

Previous reverted continuation results, recorded for context rather than as verification of future edits:

- `pnpm test`: 2,363 tests passed.
- `pnpm lint` and `pnpm check`: passed.
- `pnpm test:release`: all 12 packed-package checks passed.
- `pnpm context:validate`: passed after regenerating the map, with a size warning. That map update was subsequently reverted.
- `pnpm test:e2e`: could not complete successfully because Docker was unavailable. The retry after release rebuilding reported an unavailable container runtime.

Verified before the latest bootstrap and coverage work:

- Baseline core, idempotency and cache package tests passed before editing.
- Affected core, idempotency and DDD tests passed during implementation.
- `pnpm test`: 2,368 tests passed, including five added regression cases.
- `pnpm lint`: passed across workspaces.
- `pnpm check`: passed after formatting the existing migration test.
- `pnpm test:release`: passed for all 12 packed packages, including core lifecycle and CASL consumer checks.
- `pnpm test:e2e`: all 163 tests passed across 30 files after the user started Docker and release rebuilding completed.
- `git diff --check`: passed. `pnpm context:validate`: 58 checks passed with the existing map-size warning.

## Risks

Removing apparent duplication can change callback binding, normalization order, inheritance, diagnostic order, error propagation or concurrency behavior. Verify equivalence instead of assuming matching-looking blocks are interchangeable. Fewer lines do not justify weaker contracts or a harder-to-read implementation.

## Open Questions

None. The requirements are settled and implementation has resumed.

## Next Steps

Complete the core and correlation coverage work, then verify the additional bootstrap, module-registration, cache-key and repository reductions. Re-run release and real Nest integration checks against the final sources. Review deprecated root-entity code under the explicit getter/setter exception. Preserve the user requirements and do not force reductions.

## Snapshot Impact

No architectural contract changes. The stale structural map inherited from the baseline was regenerated; validation passed with the existing map-size warning.

## Reusable Prompt

Review the whole repository, especially `packages/` and `ddd/`, and remove unnecessary internal code and complexity. Give particular attention to `UsePipeline`, pipeline behaviors, domain entity decorators and persistence repository decorators.

Preserve every existing feature, supported input, option, public API, extension point and consumer usage. Simplify the implementation behind the existing APIs; do not require callers to change their code only to simple api but with same or better functionality and extentability. Do not remove a reusable feature just because the example application does not use it.

Rewrites are allowed, but the final production diff must have fewer real code lines AND fewer code characters than the starting baseline. This is a constraint, not the objective: the objective is less unnecessary code and a clearer implementation. Do not cheat through formatting, long lines, dense expressions, extra nesting, shorthand APIs, moving code or counting comment/documentation deletions as code reductions. Do not delete or weaken tests.

Remove genuinely redundant work, duplicated implementation, unnecessary state and needless indirection. Do not replace simple explicit code with clever or more complicated code merely to make it shorter. In particular, do not reintroduce the rejected nested ordering-rule loops or replace the existing Mutable options API with a shorthand decorator.

Review broadly and keep an honest record of the areas inspected. Do not stop after a few convenient edits and claim the repository is clean. Equally, do not force changes where there is no justified simplification: leave that code alone.

Cleanup remains the primary objective. Use coverage to verify safe simplification; do not let coverage work expand into a separate project or displace removal of unnecessary complexity. Keep tests focused on meaningful behavior and affected contracts.

Treat foundational execution and context propagation as critical code. Add focused regression tests for changes to bootstrap, handler wrapping, dependency lifecycles, ordering and context ownership, and verify real Nest composition where applicable. Bring `@nestjs-pipeline/core` and `@nestjs-pipeline/correlation` to enforced 100% statements, branches, functions and lines across production source. Achieve coverage through meaningful behavior tests, without production exclusions, coverage-ignore directives, weakened assertions or test-only production seams.

You may remove deprecated root-entity code when a documented contract and consumer-scope review establishes that it is obsolete. Do not remove root-entity getters or setters, including hydration accessors. Neither a deprecation label nor missing local usage alone justifies removing a reusable feature.

Keep test-only code in tests. Production code must serve runtime behavior or a supported consumer contract. Do not add or retain production exports, parameters, branches, injection seams or state solely to help tests access internals or satisfy coverage. Verify consumer scope before moving existing support code into tests.

Keep this task and reusable prompt synchronized with new requirements and corrections, expressed as general rules rather than conversational history.

Before each change, establish why the code is unnecessary and how existing behavior will be preserved. Follow repository instructions, verify the affected contracts with appropriate tests and checks, and measure production lines and characters separately from tests and documentation. Report what was actually removed, why the remaining implementation is simpler, what passed verification and what remains unverified. Do not commit unless I ask.

## Last Updated

2026-09-23
