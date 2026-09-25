# packages/ — published pipeline libraries

Scope: every `@nestjs-pipeline/*` package published to npm. Root rules in
[AGENTS.md](../AGENTS.md) and the
[architecture skill](../.agents/skills/nestjs-pipeline-architecture/SKILL.md) apply here
too. Repository-wide orientation: [.claude/codebase-map.md](../.claude/codebase-map.md).

## Local architecture

- One behavior concern per package: `<name>.behavior.ts` plus a `<name>.module.ts` that
  binds its tokens. Shared shapes live in `src/interfaces/`, tokens in `src/constants/`,
  pure functions in `src/helpers/`, framework-neutral errors in `src/errors/`, HTTP
  translation in `src/filters/`. `src/index.ts` is the only public entry.
- Packages depend on `@nestjs-pipeline/core` and their own integration library as **peer**
  dependencies, never as runtime `dependencies`. `@nestjs-pipeline/core` adds no runtime
  dependency beyond NestJS itself.
- These libraries target external consumers and future use cases. A missing call site in
  `ddd/users-api` does not prove an export is unused — see the library-scope rules in
  `AGENTS.md` before removing any exported API, adapter, or supported input type.

## Important files

- `src/index.ts` — public surface; anything not exported here is internal.
- `src/constants/` — injection tokens; renaming one is a breaking change.
- `README.md` — the consumer manual: purpose, setup, public API, options, behavior,
  caveats, examples. Update it in the same change that alters the contract.
- `package.json` `peerDependencies` — the advertised compatibility contract.

## Local commands

```bash
pnpm --filter <package-name> test     # vitest run
pnpm --filter <package-name> lint     # tsc --noEmit
pnpm --filter <package-name> build    # tsc -p tsconfig.build.json
pnpm test:release                     # packs every package and verifies it from a tarball
```

## Local testing requirements

- Specs live beside the source as `src/**/*.spec.ts` (Vitest, `globals: true`).
- Every package's `vitest.config.ts` enforces 100% statements, branches, functions and lines
  per file of `src/**/*.ts`. Close a gap with a behavior test; no ignore directives or
  exclusions, and remove a branch only once it is proven unreachable.
- A published package must not depend on `@nestjs/testing`. An integration path that needs
  a Nest application belongs in `ddd/users-api/test/`.
- No production seam for tests: no export, parameter, option, branch, or retained state
  added because a spec needs to reach it. Mock the module boundary instead (`vi.mock`).
- Adding or changing a published export means running `pnpm test:release`, which packs each
  package and loads it from its tarball in an isolated consumer
  ([integration/packages/README.md](../integration/packages/README.md)).

## Do not edit manually

- `dist/`, `*.tsbuildinfo`, `coverage/` — build output.
- `LICENSE`, `COMMERCIAL_LICENSE.txt` inside a package — copied by `pnpm copy-licenses`.

## Local security and compatibility rules

- Every `.ts` file carries the repository license header; `biome/plugins/package-licenses.grit`
  and `verify-package-licenses.grit` enforce it.
- Behaviors that can short-circuit without calling `next()` (cache, idempotency, rate limit,
  feature flags) are a security boundary: their keys must partition every dimension that can
  change the authorized response, and must fail closed when required context is missing.
- No transport-specific exceptions from package code; throw framework-neutral errors and let
  the consumer's filters map them. `biome/plugins/transport-neutral-errors.grit` enforces this.
- No `process.env` access in package source (`core-environment.grit`); take configuration
  through module options.
- Peer version ranges are a published compatibility promise — widening or narrowing one is a
  release decision, not an implementation detail.
