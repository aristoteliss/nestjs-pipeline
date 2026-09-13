# Repository Biome Grit Plugins

Native Biome analyzer plugins registered in the root `biome.json`. They report diagnostics; they do not rewrite code automatically.

## Plugins

### 1. `persistence-lifecycle.grit`
Enforces aggregate persistence lifecycle rules across all repositories (`**/persistence/**/*.ts`):
- Exactly `@Cache`, `@AcknowledgePersisted`, `@MapPersistenceErrors`, in that order.
- Awaited `optimisticUpdate()` call without unawaited writes.
- No manual `acknowledgePersisted`/`markPersisted` invocations.
- Repositories named `Update*CommandRepository` must declare their decorated `save()`.
- Canonical named imports from `@nestjs-pipeline/ddd-core`.

### 2. `test-suite.grit`
Enforces test suite integrity across all test files (`**/*.spec.ts`, `**/*.test.ts`):
- Forbids committing focused test runners (`describe.only`, `it.only`, `test.only`, `fit`, `fdescribe`) to ensure the entire test suite executes in CI and local verification.

### 3. `verify-package-licenses.grit`
Enforces standalone package licensing boundaries for published libraries (`**/packages/**/*.ts`):
- Forbids standalone published packages from depending on internal `ddd/` application modules (`../../ddd` or `@nestjs-pipeline/ddd-*`), guaranteeing that package distributions maintain self-contained commercial/AGPL licensing boundaries.

### 4. `package-licenses.grit`
Enforces framework compatibility in standalone published libraries (`**/packages/**/*.ts`):
- Forbids imports of private internal NestJS framework modules (e.g. `@nestjs/.../internal...`, `router-execution-context`), ensuring published packages only depend on public, stable framework contracts under their declared license tiers.

---

## Testing & Verification

- `pnpm lint:persistence` runs Biome with plugin checks.
- `pnpm check` and `pnpm test:unit` enforce all plugins across the entire repository.
- Unit test coverage against the real Biome CLI:
  - `ddd/core/persistence/biome-persistence-plugin.spec.ts` (13 tests)
  - `ddd/core/persistence/biome-general-plugins.spec.ts` (10 tests)

Reference: [Biome linter plugins](https://biomejs.dev/linter/plugins/) and [GritQL syntax](https://biomejs.dev/reference/gritql/).
