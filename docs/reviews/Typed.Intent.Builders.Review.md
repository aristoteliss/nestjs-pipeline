# Typed pipeline intent builders — staged review

Reviewed the staged changes against `70d24819175327cec46dd1614c7861c247f010b7` on 2026-09-22: four builders (`logging`, `metrics`, `trace`, `deadLetter`), their public exports/tests/manuals, and users-api migrations to these and existing builders. Original staging was preserved; review fixes are working-tree changes.

## Architecture verdict

Keep this design. The builders return the existing `PipelineBehaviorTuple` and introduce no runtime registration layer, DI dependency, option-merging policy or alternate behavior identity. All four behaviors have valid defaults, so their optional options argument is appropriate. Existing security-sensitive builders retain their required activation/key choices. Module wiring remains explicit, and raw tuples/classes remain supported.

The migrated handlers preserve behavior order, options, callback references, Maps, cache partitioning and idempotency replay-scope functions. Domain authorization and persistence paths are unchanged. The scoped public API change is additive: no export, parameter, peer range or existing tuple contract is removed. No runtime defect was reproduced in the new builders or migrated production handlers.

## Findings and repairs

| Priority / evidence | Finding | Repair |
| --- | --- | --- |
| P2 / reproduced compiler defect | The staged users-api README changes a disabled raw cache tuple to `cache({ ttl, condition })` without either `key` or `inheritModuleKey`. A temporary source probe failed TypeScript with TS2345. | Keep the deliberately disabled example as a supported raw tuple and explain the explicit key requirement when using the builder. Do not fabricate a shared key or claim nonexistent module configuration. |
| P2 / code-path inference, pre-existing in a migrated example | The same README returns `roles.map(role => authorizer.authorize(...))` as role snapshots, although `authorize` returns void. | Match the application's real list path: filter readable aggregates and call `projectRoleRead`, returning `RoleReadModel[]`. |
| P3 / contract mismatch, pre-existing in a migrated example | The core README's “Silence all logging” example leaves `errorLogLevel` enabled. | Include `errorLogLevel: 'none'`. |

Added a packed-consumer fixture for all four new public builders. It checks emitted decorator metadata against raw tuples, Map/callback options, fresh default option objects, and compile-time rejection of invalid option values/unknown keys. This supplements the staged unit tests, which alone do not verify published declarations or package-root imports.

## Verification

- Core, OpenTelemetry and deadletter package tests and TypeScript checks passed.
- Users-api: 724 tests across 104 files passed; source typecheck passed.
- `pnpm check` and `pnpm lint:persistence` passed.
- `pnpm test:release` passed for 12 packed packages, including the new intent-builder consumer fixture. The first run exposed a missing explicit Node type reference in that fixture; the corrected fixture passed.
- `pnpm context:validate` passed 58 checks (map-size warning only).

The temporary failing documentation probe was removed. No production implementation changes were necessary. No commit or publication was performed. This review does not claim exhaustive coverage of external consumers or every supported peer version.
