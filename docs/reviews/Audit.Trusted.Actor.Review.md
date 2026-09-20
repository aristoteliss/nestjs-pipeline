# Commit review — audit deletion fidelity and trusted session actor

Date: 2026-09-20. Commit under review: `2acb8a32`
(`fix(audit): ensure deletion audit fidelity with trusted session actor and metadata`).
Branch: `review/remaining-findings`.

## Scope and method

The commit touches three audited command handlers, adds
`ddd/users-api/src/common/audit/audit.options.ts`, wires `AUDIT_MODULE_DEFAULTS` into
`AuditModule.forRoot`, replaces two decorator-inspection tests with an emitted-record
suite, and documents actor resolution in the `@nestjs-pipeline/audit` README.

Each claim below was checked against source, and the contracts the commit depends on
were read rather than assumed: `audit.behavior.ts` (option merge, factory validation),
`build-record.ts` (actor/metadata resolution order), `audit.module.ts` (defaults
binding), and both audit interfaces. Findings are labelled by evidence class:
**R** reproduced defect, **S** code-path inference, **C** contract risk,
**A** architectural proposal.

## Verdict

The stated goal is met. F-06 is genuinely closed for the two deletion handlers, and
the test-quality change is the most valuable part of the commit: the removed test
asserted `auditOptions?.metadataFactory` was *defined*, which passed for as long as
the bug existed, because `AuditBehavior` reads `options.metadata` and never
`metadataFactory`. Replacing it with assertions on the record the sink actually
receives is the right correction, and the `@ts-expect-error` pair in
`audit.options.spec.ts` is real coverage — `ddd/users-api/tsconfig.json` includes
`src`, so an unused directive would fail `tsc`.

One finding is raised below. It is not new, and the commit did not introduce it —
but the commit changed its impact and is the reason it should now be re-prioritised.

## Findings

| ID | Class | Finding | Location | Disposition |
|---|---|---|---|---|
| A-01 | R | The login audit actor is still derived from the request body, and the commit made that materially worse by introducing an `authenticated` discriminator everywhere else. Detail below. | `create-auth.handler.ts:42-46` | Open. Tracked as N-03; this review upgrades it from (S) to (R) and argues for P1. |
| A-02 | C | The deletion `metadata` factories dereference `ctx.request` with no guard (`(ctx.request as DeleteUserCommand).id`). If it ever throws, `buildAuditRecord` fails and, under the default `failOpen: true`, the **entire** HIGH-severity record is dropped with a warning — not a partial record. The previous code guarded with `cmd && actor ? … : undefined`. | `delete-user.handler.ts:35`, `delete-role.handler.ts:35` | Low. `context.request` is always populated for a command; noted so the fail-open blast radius is on record, not because a path was found. |
| A-03 | A | Audit covers 3 of 8 command handlers. `CreateUserHandler`, `UpdateUserHandler`, `CreateRoleHandler`, `UpdateRoleHandler` and `DeleteAuthHandler` emit no audit record at all, so `AUDIT_MODULE_DEFAULTS` never reaches them. | `ddd/users-api/src/**/commands/` | Pre-existing, out of this commit's scope. Raised as a coverage decision for the owner, not a defect. |

### A-01 — login records are indistinguishable from authenticated ones

`sessionAuditActor()` emits an explicit discriminator on every audited deletion:

- authenticated → `{ id, authenticated: true, principalType, email }`
- no session → `{ authenticated: false }` (deliberately no `id`)

`CreateAuthHandler` overrides that default and returns
`{ id: req?.email ?? 'anonymous', email: req?.email }` — an `id` taken verbatim from
the request body, and **no `authenticated` field at all**.

Reproduced by executing `CreateAuthCommand` through the real `CommandBus` with the
commit's own module wiring (`AuditModule.forRoot({ sink, defaults: AUDIT_MODULE_DEFAULTS })`)
and a failing `UserLoginService`:

```
actor   = {"id":"attacker@evil.test","email":"attacker@evil.test"}
payload = {"email":"attacker@evil.test","code":"[REDACTED]"}
```

Two consequences, both created by this commit rather than by the original code:

1. A consumer filtering `actor.authenticated === false` to exclude anonymous activity
   does **not** exclude login records — the field is absent, so they pass as trusted.
   Before this commit no audited handler emitted `authenticated` at all, so there was
   no discriminator to be inconsistent with.
2. A consumer reading `actor.id` — the field the interface documents as "Stable
   identifier of the actor" — cannot distinguish a real principal
   (`{id: 'admin-1', authenticated: true}`) from a failed login attempt in which an
   anonymous caller typed an administrator's address into the request body.

The same commit states the rule it breaks, in two places it added:

- `audit.options.ts`: *"never the request payload: a caller-supplied field must not
  populate an identity that audit consumers read as authenticated"*, and
  *"Carries no `id`: an audit record must not be readable as if an identified
  principal performed the action."*
- `packages/pipeline-audit/README.md`: *"Never trust caller-supplied request body
  fields … Using a request body field (like `req.email`) allows unverified identities
  to pollute the audit trail"*, and *"return `{ authenticated: false }` (or omit `id`)
  rather than fabricating an `'anonymous'` identity"*.

`create-auth.handler.ts` is the literal counter-example the README names, shipped
unchanged in the commit that names it.

**This was a deliberate deferral, not an oversight.** The task file recorded
`create-auth.handler.ts` as "type guard only" and stated *"N-03 (the login actor
derived from the request body) keeps its own finding"*. The scoping decision was
sound in isolation. What it did not account for is that adding `authenticated` to
every *other* audited handler converts N-03 from "the login actor is weakly sourced"
into "login records defeat an `authenticated` filter that now exists".

**Suggested repair** (not applied — this was a review, not an implementation task).
A pre-authentication command has only a claimed identity, so record it as claimed:

```ts
actor: (ctx: IPipelineContext) => ({
  authenticated: false,
  claimedEmail: (ctx.request as CreateAuthCommand)?.email,
}),
```

No information is lost: `record.payload.email` already carries the attempted address,
as the reproduction above shows. The `'anonymous'` fallback can go — absence of a
claimed email is already expressed by the field being absent.

Coverage gap to close alongside it: `deletion-audit-records.spec.ts` asserts the actor
shape for both deletion handlers across success, failure and unauthenticated runs, but
nothing asserts the emitted record for `CreateAuthHandler` — the one audited handler
whose actor is not the trusted default.

## What the commit got right

- F-06 is closed for the path it claims. The emitted-record assertions in
  `deletion-audit-records.spec.ts` cover success, failure and the no-session case, and
  verify `metadata` reaches the sink rather than verifying a decorator entry exists.
- Module-wide defaults are the right seam: `AuditBehavior.resolveOptions()` shallow-merges
  handler options over `AUDIT_DEFAULT_OPTIONS`, so a handler can still override the actor
  where principal semantics differ — which is exactly what login needs, once it overrides
  it with an honest value.
- Resolving the actor from `sessionUserStore` is sound in the real request path:
  `SessionUserContextInterceptor` wraps downstream execution in `sessionUserStore.run(...)`,
  and `buildAuditRecord` runs inside that scope on both the success and failure branches.
- Moving the acting principal out of `metadata` and into `record.actor` normalizes it into
  the field the record interface already defines, without losing the old
  `deletedByUserId` / `deletedByEmail` information.
- `AUDIT_MODULE_DEFAULTS` uses `satisfies AuditBehaviorOptions`, keeping the literal type
  while making an unknown key a compile error.

## Verification

Commands run on this tree, all passing:

- `pnpm --filter @nestjs-pipeline/audit test` — 7 files, 72 tests.
- `pnpm --filter @nestjs-pipeline/ddd-users-api test` — 97 files, 522 tests.
- `pnpm --filter @nestjs-pipeline/ddd-users-api lint` — `tsc -p tsconfig.json --noEmit`,
  which is what makes the `@ts-expect-error` assertions in `audit.options.spec.ts` real.

The A-01 reproduction was run as a temporary spec against the real `CommandBus` and
removed afterwards; no probe file remains in the tree.
