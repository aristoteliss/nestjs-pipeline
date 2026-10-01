# Task Context

## Task

Move every package and the `api` application from CommonJS to native ES modules, and
release it as 0.4.0. It starts after the NestJS 12 upgrade
(`.claude/tasks/nestjs-12-upgrade.md`) ships 0.3.0.

## Goal

- Every published package declares `"type": "module"` and an `exports` map, builds ES
  modules with type declarations, and loads in both an ES module consumer (`import`) and
  a CommonJS consumer (`require()` of ES modules, Node >= 22.12).
- `api` builds and runs as ES modules on Express and Fastify, with tracing started before
  the framework and its HTTP, PostgreSQL and NestJS instrumentations producing spans.
- `pnpm verify:all` passes; `CHANGELOG.md` and the README upgrade section describe 0.4.0;
  the packages are versioned 0.4.0 and tagged.

## Scope

In scope: `tsconfig.base.json` and every workspace `tsconfig*.json`, every
`package.json` (`type`, `exports`, `main`, `types`), the relative import specifiers of all
TypeScript files, the CommonJS-only constructs listed below, the Vitest configs, `api`'s
build and run scripts, `api/src/main.ts` and `tracing.ts`, the MikroORM migration paths,
`integration/packages/` (the release consumers), Biome plugins that match CommonJS
syntax, READMEs, `CHANGELOG.md` and the context files.

Out of scope: bundling, runtime behavior changes, raising the Node baseline (22.12 for
the packages), the BullMQ 6 task.

## Current Status

Not started.

## Facts

Checked on `develop` at `16a55814` (2026-10-01):

- `tsconfig.base.json` sets `module: commonjs` and no `moduleResolution`; TypeScript 7
  resolves with `Bundler`. No `package.json` declares `"type"`. The 19 packages publish
  `main: dist/index.js`; only `@cqrs-ddd/core` has an `exports` map (`.`, `./domain`,
  `./application`, `./persistence`, `./http`).
- 797 tracked TypeScript files. Relative imports are extensionless and some name a
  directory (its `index.ts`); Node's ES module resolver accepts neither, so every
  relative specifier changes (`./x.js`, or `.ts` specifiers with TypeScript's
  `rewriteRelativeImportExtensions`).
- CommonJS-only constructs:
  - `packages/pipeline-cache/src/helpers/cache-factory.ts:66`: `require(pkg)` loads an
    optional store adapter synchronously. `createRequire(import.meta.url)` keeps it
    synchronous; `await import(pkg)` would make the factory asynchronous (a contract
    change).
  - `__dirname` in `api/vitest.config.ts`, `api/vitest.config.e2e.ts` and 15 specs
    (`import.meta.dirname` replaces it).
  - `module.exports` or `require()` in four specs (`cache-factory`, `casl.module`,
    `feature-flags.module`, `pipeline.module.async-contract`), and `import x = require()`
    in `api/test/lint/biome-general-plugins.spec.ts`.
- No top-level `await` in package or `api` source. It must stay that way: `require()` of
  an ES module with top-level `await` fails (`ERR_REQUIRE_ASYNC_MODULE`), which would
  break CommonJS consumers.
- `@cqrs-ddd/core` holds module-scoped registrations (`setTenantResolver`,
  `setPersistenceDialect`).
- `api`:
  - `build` is `tsc` then `tsc-alias` (aliases `@auths/*`, `@roles/*`, `@users/*`,
    `@common/*`, `@persistence/*`, `@test/*`), and it runs `node dist/main`.
  - `src/main.ts` loads the env file, then `import('./bootstrap')`, whose first import is
    `./tracing`.
  - MikroORM lists its migrations explicitly (`migrationsList`, `path:
    'dist/persistence/migrations'`, `pathTs`) and its entities from
    `PERSISTENCE_ENTITIES` (no glob discovery).
- Release check: `integration/packages/consumer` compiles with `module`/`moduleResolution`
  `NodeNext` (CommonJS output), and `node integration/packages/release.mjs` packs and
  loads every package.
- OpenTelemetry instrumentations hook CommonJS `require`; in an ES module application
  they patch modules only through the loader hook
  (`--import @opentelemetry/instrumentation/hook.mjs`, import-in-the-middle). The NestJS
  instrumentation has no Nest 12 release yet (upgrade step 10.5).

## Plan

- [ ] 1. **Decisions** (see Open Questions): ES modules only or dual output; the specifier
  style; `api`'s aliases (`tsc-alias` or `package.json` `imports`); and a check for
  circular imports between decorated classes, which can fail under ES modules (see
  Risks).
- [ ] 2. **Leaf packages**, one commit each: `@cqrs-ddd/uuidv7`, `@cqrs-ddd/untyped`,
  `@cqrs-ddd/safe-stringify`. Each gets:
  - `"type": "module"` and `exports` with `types` and `default`;
  - `module`/`moduleResolution` `NodeNext`, the specifiers and the CommonJS constructs;
  - build, lint and test at 100% coverage;
  - `pnpm test:release`.
- [ ] 3. **`@cqrs-ddd/core` and `@cqrs-ddd/mikro-orm`**, then **`@nestjs-pipeline/core`**,
  then every add-on, one commit each, verified the same way.
- [ ] 4. **Release consumers**: a CommonJS consumer that `require()`s every package and an
  ES module consumer that imports it, compiled with TypeScript `NodeNext` and `Bundler`.
- [ ] 5. **`api`**:
  - ES module build and run, with tracing first (`node --import` or the existing dynamic
    import) and the OpenTelemetry loader hook;
  - the MikroORM migration CLI;
  - Vitest configs;
  - `pnpm test:e2e`;
  - the scratch tracing check from upgrade step 10.4 for HTTP, pg and NestJS spans.
- [ ] 6. **Docs and release 0.4.0**:
  - `CHANGELOG.md` and the root README upgrade section: ES modules, and what a CommonJS
    consumer needs (Node >= 22.12; TypeScript `module` `nodenext`, `node20` or `bundler`);
  - package READMEs, versions 0.4.0;
  - `pnpm context:update` and the map's manual sections;
  - `pnpm verify:all`, then the tags.

## Decisions

None yet.

## Modified Files

None yet.

## Tests and Verification

None yet; the facts above come from reading the repository.

## Risks

- **Decorator metadata and circular imports:** `emitDecoratorMetadata` references
  parameter and property types when a class is defined. Under ES modules, a circular
  import between two decorated classes throws
  `ReferenceError: Cannot access 'X' before initialization`, where CommonJS passed
  `undefined`. Nest's `forwardRef` covers injection, not this metadata.
- **Dual output:** dual CommonJS and ES output can load two copies of a package, and with
  them two copies of `@cqrs-ddd/core`'s module-scoped registrations; one copy's
  registration would then be missing for code that loads the other.
- **Specs:** ES module namespaces are read-only, so specs that spy on or reassign a
  module's exports must use `vi.mock` instead.
- **Consumers:** dropping CommonJS output is breaking for consumers that compile with
  TypeScript `module: node16` (TS1479, as with Nest 12) or that `require()` from an
  older Node.

## Open Questions

- ES modules only, or dual output? Recommendation: ES modules only, as NestJS 12 ships.
  CommonJS consumers on Node >= 22.12 can `require()` the packages, and it avoids the
  duplicate-registration risk. (Blocking for step 2.)
- Specifiers: write `./x.js`, or write `./x.ts` and let `rewriteRelativeImportExtensions`
  emit `.js`?
- `api` aliases: keep `tsc-alias`, or move to `package.json` `imports` (`#common/*`),
  which Node resolves natively?
- Tags: the repository has both `v0.2.1` and per-package tags
  (`@nestjs-pipeline/zod@0.2.1`); which form does 0.4.0 use?

## Next Steps

1. After 0.3.0 ships, settle step 1's open questions with the owner.
2. Check for circular imports between decorated classes before converting anything.

## Snapshot Impact

Yes: build output, package entry points, run commands and the test setup. Run
`pnpm context:update`, then update the map's Stack, Commands, Conventions and Gotchas by
hand.

## Last Updated

2026-10-01
