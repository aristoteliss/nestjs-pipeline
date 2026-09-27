# Task Context

## Task

Make `@cqrs-ddd/core` ORM-agnostic: move every MikroORM-coupled building block out of it,
and fix the naming and duplication found while auditing `packages/ddd-core/persistence`.

## Goal

- `@cqrs-ddd/core` has no `@mikro-orm/*` dependency of any kind (dependency, peer or dev)
  and no source or spec that imports it.
- A new workspace package `@cqrs-ddd/mikro-orm` (`packages/ddd-mikro-orm`) holds the shared
  MikroORM adapters, with peers `@cqrs-ddd/core` and `@mikro-orm/core`.
- The api imports those adapters from `@cqrs-ddd/mikro-orm`; all tests, `pnpm lint`,
  `pnpm lint:persistence` and `pnpm test:e2e` pass.

## Scope

In scope: `packages/ddd-core/persistence`, `packages/ddd-core/domain/models/root.entity.ts`,
the new `packages/ddd-mikro-orm`, api imports and the five write-side command
repositories, the three aggregates with a copied `version` accessor, docs and context files.

Out of scope: `api/src/persistence` (all app-specific wiring; audited, nothing moves),
renaming the port `IWriteSideAggregateRepository`.

## Current Status

not started — analysis done and the direction proposed; waiting for the owner's go-ahead.

## Plan

- [ ] Move the `version` getter and private hydration setter into `RootEntity`; delete the
      identical copies in `role.entity.ts`, `user.entity.ts`, `auth.entity.ts` (must be one
      change: a subclass cannot redeclare a base private member).
- [ ] Scaffold `packages/ddd-mikro-orm` (`package.json`, `tsconfig*`, `vitest.config.ts` with
      100% per-file coverage, README, license files) following `packages/ddd-core`.
- [ ] Move the MikroORM files with their specs (list under Decisions).
- [ ] Split `cache/cache-adapter-conformance.spec.ts`: the MikroORM half moves.
- [ ] Move `IEntityManagerSource` into its own file (shared by the repository base and
      `MikroOrmCache`).
- [ ] Core: drop `@mikro-orm/core` from `package.json`; `package-manifest.spec.ts` rejects any
      `@mikro-orm/*`; `domain-entry-point.spec.ts` asserts no entry point loads MikroORM; add
      a Grit rule rejecting `@mikro-orm` imports in `packages/ddd-core`.
- [ ] Make `RootEntity` JSDoc ORM-neutral (setters serve any accessor-hydrating ORM).
- [ ] Update api imports and the five subclasses.
- [ ] Update READMEs, nested `CLAUDE.md` files, `api/src/persistence/README.md`,
      `Packages.Guide.el.md`; run `pnpm context:update`, hand-edit manual map sections,
      `pnpm context:validate`.

## Decisions

- New package rather than moving to the api: the code is generic (any MikroORM app reuses
  it) and `packages/ddd-core/CLAUDE.md` forbids generic persistence blocks in an application.
- Moves: `assert-autocommit`, `optimistic-update`, `optimistic-delete`,
  `mikro-orm-write-side.command-repository` (+ `IEntityManagerSource`), `cache/mikro-orm.cache`,
  `cache/cache-entry`, `types/unix-timestamp.type`, `root-entity.properties`.
- Stays in core: repository/cache ports, `CommandRepository`, `QueryRepository`, all
  decorators and helpers, `MemoryCache`, `mapPersistenceError` /
  `isTransientPersistenceError` (reads error codes only, no MikroORM import).
- Naming: the package name states MikroORM, so the prefix drops where nothing collides.
  `MikroOrmWriteSideCommandRepository` → `AggregateRepository` (`WriteSide` + `Command` said
  the same thing twice). `MikroOrmCache` keeps its prefix: `Cache` collides with core's
  `@Cache` decorator in files importing both.
- `rootEntityProperties()` is correctly scoped: all four `RootEntity` subclasses use it; the
  six plain row schemas and `CacheEntry` correctly do not.

## Modified Files

None yet.

## Tests and Verification

Nothing run yet. Audit done by reading source and grepping imports: the MikroORM-coupled
files import only each other and ORM-neutral core modules, so the split is clean.

## Risks

- Breaking release of `@cqrs-ddd/core` (0.2.0): exports leave `@cqrs-ddd/core/persistence`.
  Needs a version bump and changelog entry.
- Adding a public `version` getter to `RootEntity` changes a published class.
- Moving files must keep 100% coverage in both packages.

## Open Questions

- Blocking: owner approval for the new package and the breaking release.
- Final package directory name (`packages/ddd-mikro-orm` proposed) and npm name
  (`@cqrs-ddd/mikro-orm` proposed).

## Next Steps

Get approval, then start with the `RootEntity` `version` accessor move (independent of the
package split), then scaffold the package.

## Snapshot Impact

Yes: new package, new dependency edge, changed entry-point contents. Run
`pnpm context:update`; hand-edit Architecture, Critical Modules and Conventions.

## Last Updated

2026-09-27
