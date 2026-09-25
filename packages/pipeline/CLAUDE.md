# packages/pipeline — @nestjs-pipeline/core

Scope: the pipeline engine every other behavior package plugs into. Read
[packages/CLAUDE.md](../CLAUDE.md) first; it covers the rules shared by all published
packages. Repository orientation: [.claude/codebase-map.md](../../.claude/codebase-map.md).

## Local architecture

- `pipeline.module.ts` registers global behaviors and the bootstrap service;
  `pipeline.bootstrap.service.ts` discovers CQRS handlers and wraps them with the behavior
  chain; `pipeline.context.ts` carries per-request state through `AsyncLocalStorage`.
- Execution order is part of the contract: `[global before] → [@UsePipeline behaviors] →
  [global after] → handler`. When a handler's `@UsePipeline` names a behavior class that is
  also registered globally, it runs **once, at its global chain position**, with the
  handler's options — this keeps global guards outside behaviors that may short-circuit.
- The core package adds no runtime dependency beyond NestJS, except the framework-neutral
  `@cqrs-ddd/*` utilities (see [packages/CLAUDE.md](../CLAUDE.md)). `uuidv7` and `isUuidV7`
  are re-exported from `@cqrs-ddd/uuidv7`; the serializers and key-segment helpers are
  re-exported from `@cqrs-ddd/safe-stringify`.

## Important files

| File | Role |
| --- | --- |
| `src/pipeline.module.ts` | Module registration and global behavior options |
| `src/services/pipeline.bootstrap.service.ts` | Handler discovery, chain composition, bootstrap diagnostics |
| `src/pipeline.context.ts` | `IPipelineContext` and the async-local store |
| `src/decorators/pipeline.decorator.ts` | `@UsePipeline` metadata |
| `src/behaviors/logging.behavior.ts` | The one bundled behavior |
| `src/interfaces/` | `IPipelineBehavior`, `IPipelineContext` — the public contract |

## Local commands

```bash
pnpm --filter @nestjs-pipeline/core test
pnpm --filter @nestjs-pipeline/core lint
pnpm --filter @nestjs-pipeline/core build
pnpm test:e2e     # api exercises the real Nest composition paths
```

## Local testing requirements

- Changes to discovery, ordering, deduplication, or context propagation need a spec in
  `src/*.spec.ts` **and** a composition check in `api/test/` (see
  `pipeline-behavior-identity.spec.ts`, `behavior-composition-contracts.spec.ts`,
  `cqrs-discovery-without-private-metadata.e2e-spec.ts`).
- `package-boundaries.spec.ts` guards what the package may import. Do not relax it to make a
  change compile.

## Local security and compatibility rules

- `src/services/pipeline.bootstrap.service.ts` imports NestJS CQRS internals
  (`@nestjs/cqrs/dist/services/explorer.service`). This is an accepted, documented trade-off.
  Do not expand private-framework coupling, and do not treat the existing import as a
  precedent. Any change here requires explicit compatibility reasoning, tests for the
  supported Nest majors, and a README/ADR update if behavior or compatibility changes.
- Behaviors registered globally in the `before` segment are security guards for the whole
  chain. Reordering the chain, or letting a short-circuiting behavior run before them,
  changes the authorization boundary — treat any such change as architecture-sensitive.
- `@nestjs/core`, `@nestjs/common` and `@nestjs/cqrs` are pinned via root `overrides`.
  Changing those pins affects every package and the release verification.
