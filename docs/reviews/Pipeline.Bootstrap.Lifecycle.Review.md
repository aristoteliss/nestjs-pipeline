# Commit review — bootstrap lifecycle and behavior execution

Date: 2026-09-20. Commit under review: `12d912c8`
(`fix(pipeline): harden bootstrap lifecycle and behavior execution`).
Branch: `review/remaining-findings`. 41 files, +1690 / -836.

Companion to `docs/reviews/Pipeline.Bootstrap.Review.md`, which this same commit
added. That document is the review that *drove* the change — its baseline is
`2acb8a32`, this commit's parent. This one reviews the resulting implementation.
They are not duplicates; read that one for the problem statement and this one for
what shipped.

## Scope and method

The commit does three things at once: it splits `pipeline.bootstrap.service.ts` into
`pipeline-plan.ts`, `pipeline-contracts.ts` and `pipeline-runner.ts` (plus
`helpers/behavior-entries.ts` and `helpers/behavior-id.ts`), it changes real behavior
in bootstrap lifecycle, super-call dispatch and `LoggingBehavior`, and it strips
decorative comments from sixteen spec files. The commit message is two lines and
enumerates none of it, so each contract was verified independently rather than read
off the message.

Verified against source: the extracted modules, the rewritten bootstrap service, the
behavior-contract interface and its only consumers, and the pre-commit service for
comparison. Evidence classes: **R** reproduced defect, **S** code-path inference,
**C** contract risk, **A** architectural proposal.

## Verdict

The substantive changes are correct and the split is a genuine improvement. Three
things stand out as done well rather than merely done:

**Private-framework coupling did not widen.** `packages/pipeline/CLAUDE.md` treats
`@nestjs/cqrs/dist/services/explorer.service` and
`@nestjs/core/injector/instance-wrapper` as an accepted, non-precedent trade-off.
Diffing the import lines before and after shows exactly the same two imports, still
confined to `pipeline.bootstrap.service.ts`. The three extracted modules import
nothing private — `pipeline-plan.ts` touches only reflection metadata,
`pipeline-runner.ts` only the context and async-local store. A 680-line split is
exactly where that boundary usually leaks; here it held.

**The two behavior fixes are real, not cosmetic.**

- *Bootstrap rollback.* `onApplicationBootstrap` now wraps its body in
  `catch (error) { this.onModuleDestroy(); throw error; }`. Before, a strict
  diagnostics failure threw with handler methods already patched, leaving a
  half-wrapped prototype behind. `onModuleDestroy` drains `unwrappers` with a
  `while (pop())` loop, so the extra call is idempotent when Nest calls it again.
- *Super calls.* The dispatcher previously did `if (activeRunner) return activeRunner(this, request)`.
  A handler override calling `super.execute(request)` therefore re-entered its own
  chain. It now compares ownership — `activeRunner.target === currentTarget ? activeRunner.runner(...) : fallbackMethod.call(...)`
  — so a super call reaches the ancestor method instead. Covered at both levels
  (`pipeline.bootstrap.regressions.spec.ts`, and `pipeline-bootstrap-regressions.spec.ts`
  in `ddd/users-api/test/`, which is what `packages/pipeline/CLAUDE.md` requires for a
  discovery/ordering change).

**`LoggingBehavior` no longer fails a request to log it.** The request-side write
moved inside the new `observe()` guard; previously a `safeStringify` throw on a hostile
payload propagated and failed the handler. `next()` is still invoked exactly once and
the handler's error identity is untouched.

The documented order contract — `globalBefore → handler-only → globalAfter`, with a
handler declaration overriding a global behavior's *options* without relocating it —
survives the move intact in `compilePipelinePlan`, and the security reason for it is
restated at the code that implements it. The README's new "Lifecycle and inheritance"
section is accurate, including its admission that scoped behaviors have no instance at
bootstrap so instance-only contracts cannot be checked eagerly.

## Findings

| ID | Class | Finding | Location | Disposition |
|---|---|---|---|---|
| P-01 | C | `observe()` swallows every exception with no signal whatsoever. | `logging.behavior.ts` | **Fixed.** A suppressed write now emits one `warn`, inside its own guard so a broken logger still cannot fail the request. Two regression tests. |
| P-02 | C | An ordering contract passes silently when its target behavior is absent from the chain entirely. | `pipeline-contracts.ts` | **Fixed as a documentation defect.** `PipelineBehaviorOrderRule` now states that ordering is a relative-position constraint, not a dependency, and points at `validate` for requiring a peer. No diagnostic behavior changed — see the reasoning below. |
| P-03 | S | Dynamic behaviors fall back to a freshly minted context id, so they do not share request-scoped dependencies with the handler as the adjacent comment states. | `pipeline.bootstrap.service.ts:370-378` | Open. Pre-existing and byte-identical before this commit; not reproduced, so left for a change that can carry a failing case. |
| P-04 | A | The entry-dedup rule is implemented twice and must stay in sync. | `helpers/behavior-entries.ts`, `pipeline-plan.ts` | **Fixed.** `normalizeBehaviorEntries` takes optional shared accumulators; `resolveGlobalBehaviors` uses it and its duplicate is gone. One regression test pins the cross-position rule. |

### P-01 — silent, unbounded suppression in the observability behavior

```ts
private observe(write: () => void): void {
  try { write(); } catch {
    // Observability failures must not alter business execution or error identity.
  }
}
```

The intent is right and the guarantee is worth having. The problem is that there is no
second channel: if `safeSanitize` throws deterministically for a given handler's
payload shape, every request, response and error log for that handler disappears and
nothing anywhere says so. The failure mode of an observability component is silence,
which is also its normal appearance when nothing happens.

Contrast `AuditBehavior`, which also fails open but emits
`this.logger.warn(…; failing open)` so the degradation is visible.

Suggested bounded change — keep the guarantee, remove the blind spot:

```ts
private observe(write: () => void): void {
  try {
    write();
  } catch (error) {
    try {
      this.log(
        'warn',
        `LoggingBehavior suppressed a log write: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    } catch {
      // The logger itself is unusable; nothing further is safe to attempt.
    }
  }
}
```

The inner `catch` is what makes this safe when the logger is the thing that broke.

### P-02 — "must run after X" currently means "must not run before X, if X is present"

`validateBehaviorContracts` resolves each ordering target against the effective chain
and skips when it is not there:

```ts
const targetIdx = behaviorTypes.findIndex(…);
if (targetIdx === -1) continue;
```

`CacheBehavior`'s contract declares `after: ['@nestjs-pipeline/casl:CaslBehavior', 'CaslBehavior']`.
A chain containing `CacheBehavior` and no `CaslBehavior` at all produces no diagnostic —
yet that is the configuration in which a cache short-circuit is least guarded, and
`packages/CLAUDE.md` calls short-circuiting behaviors a security boundary.

This is **not** an open hole, and should not be reported as one: `CacheBehavior.validate`
independently rejects a missing or non-callable `key`, and AGENTS.md rule 5 requires that
key to partition tenant, principal and permission scope. The gap is narrower — the
ordering rule reads like a dependency declaration and is only a relative-position
constraint.

Two honest options: say so in `PipelineBehaviorOrderRule`'s doc comment, or let a
contract state a required peer. The second needs no new interface — `validate` already
receives `effectiveBehaviorTypes` and can check for itself. No shipped behavior does.

**Resolved as documentation.** The rule now says what it enforces, and points at
`validate` for the peer-requirement case. Making a missing `CaslBehavior` a
diagnostic was considered and rejected: it would fail bootstrap for an application
that legitimately caches without CASL — a single-tenant internal service, say — and
turning a passing configuration into a hard error is a breaking change that belongs
to whoever owns that policy, not to a review. `CacheBehavior` can adopt the peer
check in its own `validate` whenever that call is made.

### P-03 — context-id fallback (pre-existing, flagged for the record)

```ts
const cqrsContextId = request && typeof request === 'object' ? AsyncContext.of(request)?.id : undefined;
const contextId = cqrsContextId ?? ContextIdFactory.getByRequest((self ?? request) as Record<string, unknown>);
```

On the CQRS-bus path `AsyncContext.of(request)` supplies the handler's own context id
and the comment's promise holds. Off that path, `self` is the handler instance, which
carries no `REQUEST_CONTEXT_ID`, so `ContextIdFactory.getByRequest` mints a fresh one.
Dynamic behaviors then share request-scoped dependencies with each other but not with
the handler — narrower than "handler and behaviors share request-scoped dependencies
(transactions, tenant context, etc.)" claims.

Labelled **(S)**: this follows from reading `ContextIdFactory.getByRequest`, and I did
not build a case that reaches it. The commit did not introduce it — the lines are
byte-identical before and after — so it is noted rather than charged to this change.

### P-04 — one rule, two implementations

`normalizeBehaviorEntries` (`helpers/behavior-entries.ts`) and the inline `parseEntries`
inside `resolveGlobalBehaviors` (`pipeline-plan.ts`) both implement *first identity fixes
placement; the last tuple supplies options; a bare repeat does not erase options*. The
README states that rule once, as though one implementation backed it.

`parseEntries` cannot call the helper today because it needs a `seen` set and an options
map owned by the caller and shared across `before`, `after` and every matching config.
Giving `normalizeBehaviorEntries` optional accumulators would collapse the two.

Minor, related: `validateBehaviorContracts({ handlerType, requestKind, resolvedBehaviors, ...plan, diagnostics })`
is correct only because `compilePipelinePlan`'s return object happens not to carry those
three keys. A future rename there would shadow them silently.

## Verification

Commands run on this tree, all passing:

- `pnpm --filter @nestjs-pipeline/core test` — 18 files, 265 tests.
- `pnpm --filter @nestjs-pipeline/core lint` — `tsc --noEmit`.
- `pnpm test:e2e` — 28 files, 139 tests.
- Import-boundary check: `grep` for `/dist/` and `injector/` across `packages/pipeline/src`
  before and after the commit returns the same two lines in the same file.
