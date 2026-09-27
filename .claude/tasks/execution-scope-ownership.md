# Task Context

## Task

Separate tenant and correlation context ownership from the generic pipeline core execution scope.

## Goal

Tenant state is owned and read through `@nestjs-pipeline/tenant`, correlation state is owned and read through `@nestjs-pipeline/correlation`, and `@nestjs-pipeline/core` builds `PipelineContext` with both values without depending on either optional integration package. Nested pipeline dispatch continues to inherit the active values, and existing consumers have a documented compatibility path.

## Scope

- In scope: `packages/pipeline`, `packages/pipeline-tenant`, `packages/pipeline-correlation`, their public exports, tests, READMEs, and package dependency/build configuration if required.
- Out of scope: authorization principal or request identity; tenant and correlation remain separate concepts and correlation IDs must not become security scope.

## Current Status

not started — architecture proposal recorded; no implementation changes made.

## Plan

- [ ] Map current scope reads/writes, package dependencies, module setup, and public API consumers; decide whether core should consume registered context readers, explicit runtime adapters, or a generic extensible scope contract.
- [ ] Specify ownership and nesting semantics for tenant and correlation values, including absent values, explicit clearing, pipeline-generated correlation IDs, and nested dispatch.
- [ ] Implement the selected package boundaries and update public API exports and compatibility behavior.
- [ ] Add or update contract tests across the core runner and both integrations, including independently installed packages and nested dispatch.
- [ ] Update package READMEs and architecture context to describe the current contract.
- [ ] Run affected package tests, type checks, build, and packed-consumer release verification for the changed public packages.

## Decisions

- Treat splitting storage ownership as an architecture proposal, not an already-proven defect: current code intentionally exposes one `AsyncLocalStorage` scope and the integration packages read and write it through core.
- Preserve dependency direction: core must not import tenant or correlation packages, since both are optional integrations that already depend on core.
- Keep `PipelineContext.tenantId` and `PipelineContext.correlationId` as the assembled per-dispatch values unless an explicit compatibility decision establishes otherwise.
- Do not use correlation IDs as tenant, principal, authorization, or cache identity.

## Modified Files

- `.claude/tasks/execution-scope-ownership.md` — records the proposed multi-package architecture task.

## Tests and Verification

- Not run; this task only records proposed implementation work.

## Risks

- The current public `runInScope`, `currentScope`, and `ExecutionScope` exports may have external consumers; changing or removing them can break published API compatibility.
- Separate async-local stores can diverge during nested execution unless the core runner captures both values at the dispatch boundary and explicitly propagates them through the handler chain.
- Pipeline-generated correlation IDs must be visible to correlation package callers inside handlers, while tenant clearing and nested overrides must retain current semantics.
- Build and release packaging must work when either integration package is absent from an application.

## Open Questions

- Is this intended as a breaking API change, or must existing `runInScope` and `currentScope` consumers continue to work through a deprecation period?
- Should the core package expose a generic context-reader/adapter registration contract, or should tenant and correlation integrations register readers through Nest module wiring?

## Next Steps

Resolve the public API compatibility requirement, then choose the least coupled mechanism for core to capture tenant and correlation values at pipeline dispatch.

## Snapshot Impact

Yes. The eventual implementation changes package ownership, module/runtime integration, and public APIs. Regenerate `.claude/codebase-map.md`, then review its package responsibilities and gotchas sections by hand and validate it.

## Last Updated

2026-09-27
