# Task Context

## Task

Move every package and the `api` application from CommonJS to native ES modules, and
release it as 0.4.0. It starts after the NestJS 12 upgrade
ships as 0.3.0.

## Goal

- Every published package declares `"type": "module"` and an `exports` map, builds ES
  modules with type declarations, and loads in both an ES module consumer (`import`) and
  a CommonJS consumer (`require()` of ES modules, Node >= 22.12).
- Every package also loads in Bun, through `import` and through `require()`; the release
  check verifies it.
- `api` builds and runs as ES modules on Express and Fastify, with tracing started before
  the framework, its HTTP and PostgreSQL instrumentations producing spans, and HTTP server
  spans named by route.
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

In progress: steps 1 and 2 are done (the three leaf packages are ES modules, verified,
not yet committed); step 3 starts with `@cqrs-ddd/core`.

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
  (`--import @opentelemetry/instrumentation/hook.mjs`, import-in-the-middle). `api` uses
  the HTTP and PostgreSQL instrumentations; `HttpRouteInterceptor` names the HTTP server
  spans by route, without the NestJS instrumentation.
- Checked on 2026-10-01 with the CommonJS build of 0.3.0, in Node 24.13.0 and Bun 1.4.0:
  every package loads through `require()` and `import` with the same named exports;
  `@nestjs-pipeline/tenant`'s context survives `await`s and timers; the HTTP
  instrumentation produces server and client spans; four `api` specs (NestJS 12 on Express
  and Fastify, the exception filters, route tracing, span attributes, the pipeline context
  sources) pass with Vitest running in Bun.

## Plan

- [x] 1. **Decisions** (see Decisions) and a check for circular imports between decorated
  classes, which can fail under ES modules (see Risks). A scratch graph of the runtime
  imports of `packages/*/src` and `api/src` (type-only imports excluded) found two cycles,
  `api`'s user and role domain: entity -> events and errors -> entity. Neither has a
  decorated class, and the back edges use `User` and `Role` only as parameter types, which
  TypeScript elides, so neither is a cycle at run time.
- [x] 2. **Leaf packages**, one commit each: `@cqrs-ddd/uuidv7`, `@cqrs-ddd/untyped`,
  `@cqrs-ddd/safe-stringify`. Each gets:
  - `"type": "module"` and `exports` with `types` and `default`;
  - `module`/`moduleResolution` `NodeNext`, the specifiers and the CommonJS constructs;
  - build, lint and test at 100% coverage;
  - `pnpm test:release`.
- [ ] 3. **`@cqrs-ddd/core` and `@cqrs-ddd/mikro-orm`**, then **`@nestjs-pipeline/core`**,
  then every add-on, one commit each, verified the same way.
- [ ] 4. **Release consumers**: a CommonJS consumer that `require()`s every package and an
  ES module consumer that imports it, compiled with TypeScript `NodeNext` and `Bundler`,
  and a Bun step that loads every packed package through `import` and `require()`.
- [ ] 5. **`api`**:
  - ES module build and run, with tracing first (`node --import` or the existing dynamic
    import) and the OpenTelemetry loader hook;
  - the MikroORM migration CLI;
  - Vitest configs;
  - `pnpm test:e2e`;
  - a scratch tracing check: route-named HTTP server spans and pg spans.
- [ ] 6. **Docs and release 0.4.0**:
  - `CHANGELOG.md` and the root README upgrade section: ES modules, and what a CommonJS
    consumer needs (Node >= 22.12; TypeScript `module` `nodenext`, `node20` or `bundler`);
  - package READMEs, versions 0.4.0;
  - `pnpm context:update` and the map's manual sections;
  - `pnpm verify:all`, then the tags.

## Decisions

Settled with the owner on 2026-10-01:

- ES modules only, no dual output: CommonJS consumers on Node >= 22.12 `require()` the
  packages, and a single format avoids two copies of module state (the tenant and
  correlation stores, `@cqrs-ddd/core`'s registrations, the job-context registration) and
  of classes (filters' `instanceof`, Nest injection by class).
- Relative specifiers are written `./x.js` (and `./dir/index.js`), the TypeScript
  `NodeNext` convention, without `rewriteRelativeImportExtensions`.
- `api` keeps `tsc-alias` for its path aliases; moving to `package.json` `imports` would
  be a separate change.
- Tags as for 0.3.0: `v0.4.0` and one `<name>@0.4.0` tag per package.
- Node stays the supported runtime of `api`. Bun is verified for the packages only, by
  loading them in the release check.
- Each package switches its own `tsconfig.json` to `module: NodeNext` while the others
  stay CommonJS; `tsconfig.base.json` changes once every package is converted.

## Modified Files

- `packages/uuidv7`, `packages/untyped`, `packages/safe-stringify`: `package.json`
  (`"type": "module"`, `exports` with `.` and `./package.json`), `tsconfig.json`
  (`module: NodeNext`), relative specifiers with `.js`, `import.meta.dirname` in
  `src/package-manifest.spec.ts`.

## Tests and Verification

- Step 2, 2026-10-01: each leaf's `lint`, `rebuild` (the `dist` files are ES modules) and
  `test` at 100% coverage (16, 6 and 113 tests); `pnpm check`; `pnpm verify:all` passed:
  type checks, unit tests of every workspace (the CommonJS packages that import the
  leaves included), build, `test:release` (its CommonJS `NodeNext` consumer and the
  standalone `require()` load the ES module leaves), e2e 35 files and 224 tests.

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

None.

## Next Steps

1. Step 3: `@cqrs-ddd/core` (it already has an `exports` map with four subpaths; add
   `./package.json`), then `@cqrs-ddd/mikro-orm`.

## Snapshot Impact

Yes: build output, package entry points, run commands and the test setup. Run
`pnpm context:update`, then update the map's Stack, Commands, Conventions and Gotchas by
hand.

## Last Updated

2026-10-01
