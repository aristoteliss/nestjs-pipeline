# Task Context

## Task

Resolve finding F-06 from `docs/reviews/Final.Review.md`: audit options that look correct
and are silently ignored on the two HIGH-severity deletion handlers.

## Goal

Both deletion handlers emit an audit record carrying the acting principal and the deletion
target; an unknown audit option is a compile error; tests assert the emitted record rather
than the presence of a decorator entry.

## Scope

In scope: `ddd/users-api/src/users/cqrs/commands/delete-user.handler.ts`,
`ddd/users-api/src/roles/cqrs/commands/delete-role.handler.ts`,
`ddd/users-api/src/auths/cqrs/commands/create-auth.handler.ts` (type guard only),
`ddd/users-api/src/common/audit/`, `ddd/users-api/src/infrastructure/observability.module.ts`,
the two command-handler specs, `packages/pipeline-audit/README.md`.

Out of scope: N-03 (the login actor derived from the request body) keeps its own finding;
only the shared trusted actor factory it will build on is added here. No change to the
audit package's option types or decorator generics.

## Current Status

done — implemented and verified.

## Plan

- [x] Replace raw `[AuditBehavior, {...}]` tuples with the typed `audit({...})` intent builder
- [x] Rename `metadataFactory` to `metadata` and keep the target identifier there
- [x] Add a trusted session actor factory and wire it once as `AuditModule.forRoot` defaults
- [x] Add compile-time coverage that an unknown audit option is rejected
- [x] Replace the decorator-inspection tests with emitted-record tests
- [x] Verify and update the codebase map / review documents

## Decisions

- Used the existing `audit()` intent builder instead of extracting option constants with
  `satisfies AuditBehaviorOptions` (the review's suggestion). Both make an unknown property a
  compile error; the builder is the repository's own supported S-02 pattern, keeps the option
  literal at the call site, and needs no extra constant per handler.
- The actor factory is module-wide (`AuditModule.forRoot({ defaults })`) because every audited
  request in this application resolves its principal from the same session context.
- No session principal yields an explicit `{ authenticated: false }` actor rather than an
  omitted actor or a fabricated `'anonymous'` id, so a HIGH-severity record distinguishes an
  unauthenticated action from a lost field.
- The acting principal is no longer duplicated into metadata; metadata carries the target only.

## Modified Files

- `ddd/users-api/src/common/audit/audit.options.ts` — new: `sessionAuditActor`,
  `AUDIT_MODULE_DEFAULTS`, `UNAUTHENTICATED_AUDIT_ACTOR`.
- `ddd/users-api/src/common/audit/audit.options.spec.ts` — new: actor resolution plus the
  compile-time rejection of an unknown audit option.
- `ddd/users-api/src/infrastructure/observability.module.ts` — registers the defaults.
- `delete-user.handler.ts`, `delete-role.handler.ts` — `audit({ action, severity, metadata })`.
- `create-auth.handler.ts` — same builder, actor semantics unchanged (N-03).
- `users-command-handlers.spec.ts`, `roles-command-handlers.spec.ts` — decorator-inspection
  tests removed.
- `ddd/users-api/test/deletion-audit-records.spec.ts` — new: emitted-record assertions.
- `packages/pipeline-audit/README.md` — trusted-actor guidance.
- `docs/reviews/Final.Review.md`, `docs/reviews/LLM.Agent.Implementation.Brief.md` — F-06 closed.

## Tests and Verification

- `pnpm --filter @nestjs-pipeline/ddd-users-api test` — pass
- `pnpm --filter @nestjs-pipeline/ddd-users-api lint` — pass (typechecks the `@ts-expect-error`
  guard; `test/` is outside the tsconfig program, so the guard lives under `src/`)
- `pnpm --filter @nestjs-pipeline/audit test` — pass
- `pnpm lint:persistence`, `pnpm check` — pass
- E2E not run (requires Docker/Redis infrastructure).

## Risks

Audit record shape changes for the two deletion actions: `metadata.deletedByUserId` and
`metadata.deletedByEmail` move to `actor.id` / `actor.email`. Any downstream query over
stored records for those fields must follow.

## Open Questions

None blocking.

## Next Steps

N-03: decide whether the login record carries the claimed identity as a subject or omits the
actor until authentication succeeds. The module default now supplies a trusted actor whenever
the handler does not override it.

## Snapshot Impact

Adds `ddd/users-api/src/common/audit/`. Ran `pnpm context:update`; the manual sections of
`.claude/codebase-map.md` needed no edit (no change to architecture, entry points, commands,
or conventions).

## Last Updated

2026-09-20
