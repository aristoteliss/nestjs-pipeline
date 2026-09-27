# Task Context

## Task

Carry the same execution context — tenant, principal (authorization session) and
correlation id — from a request into the jobs it enqueues, so a job makes the same
decisions the request would. Let system-started work, such as a cron job, declare its
context with a decorator. One tenant source instead of two. Build the reusable part in the
pipeline packages. Part of [persistence-refactor](persistence-refactor.md).

## Goal

- A job processor runs inside the tenant, principal and correlation id captured when the
  job was enqueued; nothing is re-derived from ad-hoc payload fields.
- A system job runs inside a context its decorator declares explicitly; nothing falls back
  to a default tenant or an anonymous principal.
- The database store, core's cache keys, the pipeline and the jobs read the tenant from one
  source.
- Missing context fails closed everywhere.

## Scope

In scope: `packages/pipeline-tenant`, `packages/pipeline-correlation` or a new context
package (decision pending), `api/src/users/jobs/`, the dispatch ports in
`api/src/users/application/ports/user-event-dispatcher.port.ts`,
`api/src/common/context/`, `api/src/persistence/tenant-schema.context.ts`,
`api/src/common/modules/observability.module.ts`.

Out of scope: which permissions a principal has (CASL rules stay resolved by the
application's permission source).

## Current Status

ready to build — design and exported names confirmed by the owner (2026-09-27); no code yet. Done beforehand: `TenantSchemaContext` fails
closed (commit after `7de27956`): no default-tenant fallback; `run(undefined)` and
`schema` outside a run throw `MissingTenantContextError`; the pipeline reads
`tenantContext.current`.

## Plan

- [x] Trace today's context carriers (results under Design): `TenantSchemaContext` (set by
      `TenantSchemaMiddleware`, read by stores and jobs); `@nestjs-pipeline/tenant`'s
      scope (filled by the pipeline from `tenantIdFactory`, read by core cache keys through
      `setTenantResolver(currentTenantId)`); `sessionUserStore` (set by
      `SessionUserContextInterceptor`, empty in jobs); correlation (`addCorrelationId` /
      `@WithCorrelation`).
- [ ] One tenant source: `TenantSchemaContext` delegates to `runWithTenant` /
      `currentTenantId` of `@nestjs-pipeline/tenant`; the store, cache keys, pipeline and
      jobs agree; a spec proves it for work started outside a pipeline dispatch.
- [ ] Scaffold `packages/pipeline-job-context` (`@nestjs-pipeline/job-context`) from
      `packages/pipeline-tenant`: peers `@nestjs-pipeline/core`, `/tenant`, `/correlation`;
      `src/interfaces/`, `src/errors/`, `src/helpers/`, `src/constants/`, one
      `src/index.ts`; 100% per-file coverage; README; add to `package-boundaries.spec.ts`
      and the release consumer if needed.
- [ ] Package: `withJobContext`, `@InJobContext`, `@AsSystem`, `IJobPrincipal`,
      `JobContextModule.forRoot({ principal, tenants })`, `MissingJobContextError`,
      `InvalidJobContextError`, as specified under Design.
- [ ] api: implement `IJobPrincipal` — capture from `sessionUserStore`; restore re-checks a
      user reference against its `Auth` session (exists, not revoked, not expired) and the
      user row, then binds it through `sessionUserStore`; a service reference binds the
      grants `@AsSystem` declared. Register the tenant list from `persistenceConfig()`.
- [ ] Migrate `BullMqUserEventDispatcher` to `withJobContext` and both processors to
      `@InJobContext`; delete `tenant?` from the dispatch ports, the per-job `tenant` and
      `correlationId` fields, and `resolveBatchTenant`'s role where the context replaces it.
- [ ] Update READMEs, `api/CLAUDE.md`, the codebase map (Architecture, Security notes); run
      the full check list including `pnpm test:release`.

## Decisions

- `TenantSchemaContext` fails closed (AGENTS.md rule 5); specs that relied on the default
  now state their tenant (`ITenantContext` stubs, `inTenant(app, ...)` in e2e support).
- Principal (owner, 2026-09-27): a job carries an identity reference only — principal id,
  type, tenant and session id. When it runs, permissions are re-read from current rules;
  a deleted user or a revoked session makes the job fail closed. Rejected: a full session
  snapshot (a queue writer could forge grants) and a signed snapshot (decides on stale
  permissions, needs a key).
- Package (owner, 2026-09-27): a new `@nestjs-pipeline/*` package owns capture at enqueue
  and restore at process, with one decorator, building on `@nestjs-pipeline/tenant` and
  `@nestjs-pipeline/correlation`.
- System jobs (owner, 2026-09-27): the decorator names a service principal with explicit
  grants, and the job runs once per configured tenant, each run in its own tenant context.
- Exported names (owner, 2026-09-27): as listed under Design.

## Design

Trace results (2026-09-27):
- The principal is bound per request by `SessionUserContextInterceptor`
  (`sessionUserStore.run`) and read by `CaslPermissionSource`; a job has no interceptor,
  so today it runs with no principal at all.
- Requests do not look up the session per call (stateless JWT); a job must, to honor a
  revoked session.
- Tenant: `TenantSchemaContext` and `@nestjs-pipeline/tenant`'s scope are two
  `AsyncLocalStorage` stores bridged only inside a pipeline dispatch.

One tenant source: `TenantSchemaContext` delegates to `runWithTenant` /
`currentTenantId` of `@nestjs-pipeline/tenant`, so the store, core's cache keys
(`setTenantResolver(currentTenantId)`), the pipeline and jobs read one store.

New package `@nestjs-pipeline/job-context` (`packages/pipeline-job-context`), peers
`@nestjs-pipeline/core`, `/tenant`, `/correlation`:

| Export | Role |
| --- | --- |
| `PrincipalReference` | `{ id, type, sessionId? }` — identity only, never grants |
| `JobContext` | `{ tenantId, correlationId, principal }` |
| `withJobContext(data)` | at enqueue: returns `data` plus `jobContext`, captured from the current tenant, correlation id and principal; throws when any is missing |
| `@InJobContext({ path? })` | at process: validates the payload's `jobContext`, then runs the method in its tenant, correlation id and restored principal; fails closed |
| `@AsSystem({ principal, grants })` | for system-started work: runs the method once per configured tenant, each with a fresh correlation id and the declared service principal and grants |
| `IJobPrincipal` | application port: `capture()` from the request, `restore(reference, work)` re-checks and binds the principal, throwing to fail closed |
| `JobContextModule.forRoot({ principal, tenants })` | registers the port and the tenant list |
| `MissingJobContextError`, `InvalidJobContextError` | framework-neutral errors |

Grants come only from code (`@AsSystem`), never from a payload; `@InJobContext` rejects a
payload principal that carries any. The api implements `IJobPrincipal`: a user reference is
re-checked against its `Auth` session (exists, not revoked, not expired) and the user row,
then bound through `sessionUserStore`, so `CaslPermissionSource` reads current rules.

## Modified Files

None for the remaining steps.

## Tests and Verification

Fail-closed step, 2026-09-27: `pnpm lint`, `pnpm check`, `pnpm lint:persistence`,
`pnpm test`, `pnpm test:e2e` (35 files, 194 tests) all pass.

## Risks

- Security: a payload is data. A principal read back from a queue must not be trusted more
  than the queue's integrity allows.
- A permission change between enqueue and processing: the job must use current rules or
  the rules at enqueue time, deliberately.

## Open Questions

- Resolved 2026-09-27: all three design questions (see Decisions).

## Next Steps

Start with the one-tenant-source step (api only, no new package), then scaffold the package.

## Snapshot Impact

Yes: Architecture (multi-tenancy, jobs), Security and Operational Notes.

## Last Updated

2026-09-27
