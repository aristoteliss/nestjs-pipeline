# Task Context

## Task

Review-driven cleanup of `api/src/common`: delete what a package already does, move
package-level logic into its package, simplify the rest, relocate misplaced specs, and
bring every agent/Claude context file up to date.

## Goal

- `api/src/common` holds only application wiring; package logic lives in its package.
- Package changes are additive only: no removed or changed export of any 0.2.0 package,
  no narrowed peer range.
- Each external system (Redis, PostgreSQL, ...) has one standalone config module that
  every consumer reads; the rule is written into the agent docs.
- api tests, package tests (100% coverage), `pnpm lint`, `pnpm lint:persistence`,
  `pnpm check`, `pnpm test:release` and `pnpm context:validate` pass.

## Scope

In: `api/src/common/**`, its consumers in `api/src/**` and `api/test/**`,
`packages/pipeline-casl`, `packages/pipeline-opentelemetry` and the add-on packages that
gain telemetry mappers, AGENTS.md, CLAUDE.md files, the architecture skill, the codebase
map, READMEs, CHANGELOG.
Out: removing `sessionUser` from `@cqrs-ddd/core` (breaking), any breaking package change.

## Current Status

verifying — all steps implemented; unit, lint, check, release and e2e verification pass. Waiting for the owner's review (no commit).

## Plan

- [x] 1a. Delete `ITenantContext`/`TENANT_CONTEXT`; consumers use `requireTenantId`
- [x] 1b. Telemetry bridge redesign (package-owned mappers, generic join)
- [x] 1c. Delete duplicate cache-key specs
- [x] 1d. Drop `sessionUser` use in the api
- [x] 1e. Remove unused and test-only exports
- [x] 2a. `abilityDigest` in `@nestjs-pipeline/casl`
- [x] 2b. Entity-dependence check in `@nestjs-pipeline/casl`
- [x] 3a. Simplify the idempotent-operation helper; one trusted-principal check
- [x] 3b. Dead-letter options: one `captureKinds`, no unreachable entry, own folder
- [x] 3c. One config module per external system (Redis, PostgreSQL)
- [x] 3d. Header constants, redaction paths, session-principal file/type cleanup
- [x] 5. Relocate specs; stop exporting handler key factories for tests
- [x] 6. Agent/Claude docs pass (invalidated by this change and already stale)
- [ ] 7. Full verification

## Decisions

- `api/test/` is typechecked (`api/tsconfig.json` includes it; `tsconfig.build.json`
  pins `include: ["src"]`); the vitest `restructure-fallback-resolver` is removed and
  68 stale imports point at the real files. `@types/pg` added as an api dev dependency.
  `test/cache-write-through-cas.e2e-spec.ts` wrote and read the `cacheKey` function
  instead of the computed key, so it proved nothing; it now uses the key and passes.
- Builder files are named `src/helpers/build-attributes.ts` (like `build-key.ts`,
  `build-record.ts`); their docs present spans, audit metadata and logs as uses.

- Tenant reads use `requireTenantId(undefined, purpose)` of `@cqrs-ddd/core/application`;
  specs set the tenant with `setTenantResolver` (restored after each test) or
  `runWithTenant`. Rejected: a `@nestjs-pipeline/tenant` throwing reader (would need an
  error class the tenant package cannot import).
- Replay scope is `requireAbilityDigest` of `@nestjs-pipeline/casl` (throws
  `MissingAbilityError` without an ability, as the idempotency contract asks); the api's
  error and replay-scope version are gone. The operation-key version stays: changing a
  stored key's format would let a completed create run again. The helper that remains
  lives in `api/src/common/idempotency/operation-key.ts`.
- One principal rule, `principalSegments(principal)`: non-blank string id (trimmed) and a
  known type. Idempotency, rate-limit and overview-cache keys and `isSessionPrincipalValid`
  all use it.
- `SessionPrincipal` keeps `expiresAt` (ms) only; a session-cookie principal without it
  counts as expired, so cookies written with the old `exp` field re-authenticate.
- Telemetry: each add-on exports `build<Name>Attributes(context)` (no OTel dependency,
  `{}` when its behavior did not run, never a key); `@nestjs-pipeline/opentelemetry`
  exports `AttributesBehavior({ factories })`, the bridge generalized (reads on unwind,
  writes the shared bag, per-factory fail-open, async allowed). Placed in the OTel
  package, not core: its only job is feeding the OTel bag. Rejected: moving the bridge
  as-is (OTel would depend on five add-ons); add-ons writing the bag themselves (the
  application would lose per-attribute choice).
- `@cqrs-ddd/core` gains `requireTenant(purpose, source?)`; `requireTenantId(source,
  purpose)` is deprecated and calls it (owner's request: required argument first).
  `requireTenant` is also the name of a boolean option in core's `TenantPartitionOptions`.
- Handler key factories are no longer exported; specs read them from `@UsePipeline`
  metadata through `test/support/declared-options.ts`.

## Modified Files

- Packages (additive only): `pipeline-casl` (`abilityDigest`, `CaslAuthorizer.dependsOnEntity`,
  dependency `@cqrs-ddd/safe-stringify`); `pipeline-opentelemetry` (`AttributesBehavior`);
  `pipeline-cache`, `-idempotency`, `-rate-limit`, `-feature-flags`, `-deadletter`
  (`build<Name>Attributes` in `src/helpers/build-attributes.ts`); `ddd-core`
  (`requireTenant`, `requireTenantId` deprecated). READMEs and CHANGELOG updated.
- `api/src/common`: removed `behaviors/`, `context/tenant-context.port.ts`,
  `cqrs/helpers/read-freshness.helper.ts`, `constants/auth-headers.constants.ts`,
  `types/SessionPrincipal.ts`; added `constants/headers.constants.ts`, `dead-letter/`,
  `environment/redis.config.ts`, `environment/otlp.config.ts`,
  `types/session-principal.ts`; moved the operation key to `idempotency/operation-key.ts`,
  `context/session-principal.store.ts`, guard, interceptor, modules.
- `api/src/auths`, `users`, `roles`, `persistence`, `tracing.ts`: consumers updated.
- Specs moved out of `common/` to `api/test/` and beside commands/entities; duplicate
  cache-key specs and the tenant-port specs deleted; `test/span-attributes.spec.ts` and
  `test/support/declared-options.ts` added.
- Docs: `AGENTS.md` (rule 7, new rule 23, naming path), `CLAUDE.md`, `api/CLAUDE.md`,
  `packages/CLAUDE.md`, `packages/ddd-core/CLAUDE.md`, architecture skill, codebase map
  (regenerated + manual sections), root and api READMEs.

## Tests and Verification

- After typechecking `api/test/`: api `tsc` 0 errors (was 101 in 29 test files); api
  unit 111 files / 901 tests; e2e 34 files / 221 tests.

- Final: `pnpm build` exit 0; `pnpm lint` exit 0 (persistence plugins + every workspace
  `tsc`); `pnpm check` clean (872 files); `pnpm test` exit 0 (20 workspaces, api 111 files /
  901 tests); `pnpm test:release` passed (19 packed packages); `pnpm context:validate` 58/58,
  `pnpm context:check` up to date. `pnpm test:e2e` 34 files / 221 tests passed, after the
  e2e harness (`test/support/e2e-app.ts`) gave its test cookie principal an `expiresAt`
  (first run: 104 failures, all from anonymous 403s caused by the missing expiry).

- After 1a–3a: `pnpm --filter @nestjs-pipeline/casl test --coverage` 202 passed, 100%;
  api `vitest run` 109 files / 903 tests passed; api `tsc --noEmit` clean.
- After 1b and `requireTenant`: cache 95, idempotency 144, rate-limit 64, feature-flags
  59, deadletter 76, opentelemetry 73, ddd-core 385 tests, each `vitest run --coverage`
  exit 0 (100% gate); api 109 files / 896 tests; new `test/span-attributes.spec.ts`
  fails when the factories are removed from `ObservabilityModule` (checked) and passes
  with them.

- Baseline (before any change, after `pnpm build`): api 112 files / 935 tests pass;
  `pnpm lint` passes; `pnpm check` clean. Without `pnpm build` first, 83 api test files
  and the api typecheck fail because the packages have no `dist/`.

## Risks

- Replay-scope digest value changes: idempotency records stored before the change refuse
  replay (409) until they expire. Fail-closed.

## Open Questions

- `requireTenant` shares its name with core's `TenantPartitionOptions.requireTenant` option.

## Next Steps

- Owner reviews the working tree; after acceptance, delete this file (only `TEMPLATE.md` stays).

## Snapshot Impact

Yes: common/ layout, conventions (config modules), tenant port removal. Run
`pnpm context:update` and edit Architecture, Conventions, Gotchas by hand.

## Last Updated

2026-09-29
