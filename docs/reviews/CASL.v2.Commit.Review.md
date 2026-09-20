# CASL v2 architecture and implementation review

Reviewed commit: `9b7b17ac5d481bf2fab3619dfcb57d1640f6b6b8`  
Review date: 2026-09-22  
Baseline: HEAD matched the requested commit and the worktree was clean before review.

## 1. Architecture assessment

**CASL package verdict: keep the architecture; repair the root-array projection contract before releasing the library.** No authorization bypass was reproduced in the CASL package. Findings 1–4 concern users-api authentication, not defects in the reusable CASL package. The package passed 165 tests and the packed Nest bootstrap.

**For the original whole-commit review: request changes to the authentication lifecycle before release.** The CASL rewrite is substantially smaller, has a clearer application boundary, and preserves the repository's intended two-stage authorization. The findings below call for repairs within these boundaries, not another rewrite.

The commit implements the principal decisions in `CASL.v2.Implementation.Plan.md`: one application-owned permission source, deny-after-allow ordering, three authorizer methods, projected read models, materialized user rules, and short-lived access tokens backed by rotating refresh sessions. The breaking public API is an explicit alpha-stage decision; removal of the old role-provider APIs is not an accidental compatibility defect.

### Boundaries that are appropriate

| Area | Assessment and evidence |
| --- | --- |
| Reusable library | `ICaslPermissionSource` leaves databases, roles, authentication and tenant composition in the consumer. CASL does not acquire dependencies on users-api or persistence. |
| Two-stage authorization | `requires(...)` establishes type-level eligibility; handlers authorize actual aggregates and accepted mutation fields. This is necessary because a conditional type check cannot decide whether a particular entity is allowed. |
| Authorizer API | `can`, void `authorize`, and `project` separate boolean decisions, write checks and response masking. `Projected<T>` honestly represents absent fields. One root-container implementation mismatch remains below. |
| Read path | Single reads bypass repository cache when authorization depends on entity state. Lists check and project each aggregate. The overview separately authorizes `UserCapabilities`, readable role names, and the final user candidate. |
| Write responses | Controllers perform an authorized query after a committed write and return `{}` for authorization denials. They do not expose the command's raw aggregate. Other read failures still propagate, as documented. |
| Cache and idempotency | Overview cache keys bind tenant, principal and effective rules; entity-dependent rules bypass the response cache. Creation idempotency retains a stable operation key and checks a separate replay-scope digest. Keep these two policies distinct. |
| Permission materialization | Per-origin rows preserve duplicate grants and support precise FK cascades. The projector uses caller transactions and ordered user locks. This is a reasonable read-optimization with explicit write-side obligations. |
| Authentication ports | Handlers depend on token/session/user ports; hashing, JWT issuance, persistence and cookies remain behind their respective adapters. Session writes preserve lifecycle decorators and version-conditioned updates. |
| Nest integration | The explicit `CaslAuthorizer` factory avoids constructor-DI inference. The packed consumer successfully bootstraps the actual module with an application permission source. |

These conclusions were checked against the architecture skill's positive examples, especially create/update-user, authorized user queries, versioned persistence, `CommandBaseHandler`, and the permission source. They are not based solely on the instructions expressing an intended design.

### Tradeoffs and architecture follow-ups

These are **contract risks or architectural proposals**, not additional reproduced implementation findings:

1. **The materialized authorization table requires disciplined writers.** Rebuild belongs in the same transaction as assignment/capability changes. Currently there are no production assignment commands to retrofit. When adding them, make rebuilding part of the persistence operation's contract and test rollback and overlapping writers. A periodic verifier detects drift; it cannot prevent an interval of over-authorization.
2. **Two parallel reads are not a consistent database snapshot.** `Promise.all` reduces latency for principal attributes and rules, but a concurrent update can produce values from different committed instants. The current code also does not make authorization and later mutation atomic. Do not promise stronger consistency; if a future use case requires it, design a shared snapshot/version or transaction-aware application port explicitly.
3. **Permission-bearing tokens intentionally delay revocation.** Rule, department and user-deletion changes can remain invisible until a token expires. Fastify session-cookie requests still read database permissions; the zero-read option applies to bearer authentication. Both are documented decisions, not bugs found here. Expiry enforcement is therefore essential, as finding 3 explains.
4. **Refresh state and its response have a failure boundary.** Version-conditioned saves prevent stale writes but do not guarantee successful delivery of the new cookie. Move avoidable fallible preparation before committing rotation; lost HTTP responses still need a documented recovery policy. Do not claim that the grace window solves all lost-response cases.
5. **Revocation-event delivery has a known gap.** Reuse saves a revoked aggregate and throws; `CommandBaseHandler.execute()` only publishes after a successful return. Thus `AuthRevokedEvent` is not published on that path. The implementation plan already acknowledges this. There is no current subscriber whose behavior I reproduced as broken. Before relying on the event, choose an explicit result/error-boundary design compatible with the base handler. Do not patch it with ad hoc manual publication or claim an in-memory bus is durable.
6. **Lists are authorized in memory.** This is valid for this example. Large collections and authorized pagination need a query-side design; adding an ORM translator to the CASL package is not required for this review.

The plan's delivery narrative lists three PRs and phase commits, whereas the requested commit contains the combined change. I assessed the actual combined snapshot; I did not infer independent green intermediate commits from that narrative.

## 2. Implementation findings

Priority: P1 = fix before release; P2 = concrete correctness/contract defect to repair. All five have runtime reproduction evidence. The refresh concurrency probe controls interleaving using the existing version-conditioned test store; it is not a PostgreSQL concurrency test.

### 1. [P1] Reject legacy tokens when removing persisted-session validation

**Location:** `ddd/users-api/src/auths/services/jwt-authenticator.ts:167–183`, particularly the optional `sid` mapping at line 171. Related migration: `ddd/users-api/src/persistence/migrations/Migration20260922000000.ts:13–15`.

**Reproduced defect; upgrade impact inferred from the parent implementation.** A signed, unexpired token containing `sub`, `tenant` and legacy `roles`, but no `sid`, authenticates successfully. The parent verifier required its exact token to exist in the `auth` table. The new verifier removes that lookup and imposes no new-generation requirement.

If a user logged out before the upgrade, the old token's row was removed and the old server rejected it. After upgrading with the same JWT verification key, the new server accepts that still-unexpired token again. The migration deletes old sessions and says users must log in again, but deleting rows cannot invalidate statelessly accepted JWTs. Database-backed CASL still requires an existing user and applies current permissions; this is resurrection of authentication, not restoration of old token roles.

**Repair:** require the new access-token contract, including a non-empty `sid`, and define an explicit credential cutover. A signing-key/token-version cutover is another valid choice. Review Fastify's old encrypted session cookies separately: the resolver accepts their stored principal without querying the deleted session table, so a JWT-only check does not establish an all-transport logout guarantee.

**Regression checks:** create a legacy token, remove its old session, upgrade without changing the key, and require 401. Test a surviving pre-upgrade Fastify cookie. Confirm freshly issued access tokens continue to authenticate statelessly.

### 2. [P1] Retry historical-token revocation when a rotation wins the version race

**Location:** `ddd/users-api/src/auths/cqrs/commands/refresh-auth.handler.ts:89–95`.

**Reproduced defect.** The consumed-history branch revokes and saves outside the `ConcurrencyConflictError` handling used by the live-token branch.

Reproduction:

1. Rotate `A → B → C`, so `A` is found only in consumed-token history.
2. Present `A`; the handler loads the session to revoke it.
3. Before that save, another request rotates `C → D` and commits.
4. Revocation loses the version race and throws `ConcurrencyConflictError` instead of the reuse result.
5. The persisted session remains unrevoked, and `D` successfully refreshes again.

The existing probe store checks expected versions exactly as the repository does. The probe asserted the conflict, a null `revokedAt`, and a subsequent successful refresh. Detection of a compromised token family has therefore failed to revoke that family.

**Repair:** put historical-token revocation behind a conflict-aware application/persistence operation that reloads and reapplies revocation to the same session. Preserve version conditioning; do not use a stale aggregate to overwrite the winning rotation. Define bounded-conflict behavior explicitly, and inspect logout's similar read/revoke/save sequence while implementing the shared revocation policy.

**Regression checks:** deterministic interleaving at the save boundary, plus a real persistence test with separate EntityManagers. Assert that the winner's current refresh token is unusable after historical reuse is handled. Cover concurrent revocation and deleted-session outcomes.

### 3. [P2] Require expiry on stateless access tokens

**Location:** `ddd/users-api/src/auths/services/jwt-authenticator.ts:130–134,181–183`.

**Reproduced defect.** A correctly signed token with `sub`, `tenant`, `sid` and `principalType: 'user'`, but no `exp`, authenticates and produces `exp: undefined` and `expiresAt: undefined`. Signature verification checks an expiry when supplied; this call does not require one.

The local issuer always sets `exp`, so normal local login does not generate this input. However, asymmetric/external signed tokens are explicitly supported, and the verifier no longer has the persisted-session backstop. A trusted issuer's malformed token can consequently authenticate indefinitely. In permissions-in-token mode that would also make its permission snapshot unbounded. This does not let an attacker forge a signature.

**Repair:** require `exp` during JWT verification and validate the agreed access-token claims. If maximum token age is also a requirement for external issuers, require `iat` and enforce that separately; merely checking for an expiry does not restrict a very long expiry.

**Regression checks:** absent expiry rejects; expired expiry rejects; valid configured lifetime accepts. Keep the legacy-token test separate so each requirement is independently covered.

### 4. [P2] Avoid committing refresh rotation before fallible token preparation

**Location:** `ddd/users-api/src/auths/cqrs/commands/refresh-auth.handler.ts:100–116`, with rotation persistence at lines 151–154.

**Reproduced defect.** `evaluate()` commits the new refresh hash before the user read and `signToken()`. If either fails, the request returns an error and no new refresh cookie is delivered.

The probe made `signToken()` fail once, modeling a permission-read/issuance failure. The session had already rotated away from the client's token. Retrying with that token within the grace window succeeded but returned no `refreshToken`, so the client could not recover the current cookie. After 31 seconds with the default 30-second grace, the same client token caused reuse revocation.

This is more than an ordinary retryable 500: a temporary backend error permanently strands the session's refresh credential. The existing client token eventually logs the user out even after the backend recovers.

**Repair:** prepare the authoritative user read, permission read and signed access token before the durable rotation, while returning neither token unless the session transition succeeds. Maintain session validation and re-evaluation on conflicts; do not return a prepared token for a revoked/expired session. This removes the avoidable application-failure window. A commit followed by process/network failure remains a separate delivery limitation and needs an explicit recovery decision, not a promise of exactly-once delivery.

**Regression checks:** user-read and issuer failures leave the original refresh token current; a retry rotates normally and delivers a cookie. Re-run concurrent refresh, grace, expiry and revocation tests after reordering.

### 5. [P2] Match `project()`'s root-array runtime shape to its public type

**Location:** `packages/pipeline-casl/src/helpers/authorizer.ts:83–99`; `packages/pipeline-casl/src/helpers/projection.ts:132–145`.

**Reproduced defect.** The public generic accepts an array because arrays are objects, and `Projected<T>` declares an array result. The projection helper always initializes the root result as `{}` and traverses `Object.entries(record)`.

```ts
const authorizer = new CaslAuthorizer(buildAbility(['User|read|*']));
const projected = authorizer.project('read', 'User', [{ id: 'one' }]);
// Declared: ({ id?: string } | null)[]
// Actual:   { '0': { id: 'one' } }
// Array.isArray(projected) === false
```

A consumer can call `.map()` without a TypeScript error and fail at runtime; JSON also changes from an array to an object. The nested-array masking tests do not cover this root case. There is no affected users-api call site, but this is a published library contract.

**Repair:** preserve root-array shape and index masking, with explicit root field-path semantics. Alternatively, make root record-only input an explicit, type-enforced and runtime-validated API restriction; that is a contract decision, not an invisible cast. Do not change the intentionally retained parent-grant inheritance semantics.

**Regression checks:** mutable/readonly root arrays, empty arrays, denied indices and nested arrays; assert both runtime shape and inferred return type. Collections of separately authorized entities still need per-entity checks: array-shape support must not be mistaken for authorizing every item against a different entity.

## 3. Verification performed

| Check | Current review result |
| --- | --- |
| `pnpm --filter @nestjs-pipeline/casl test` | 6 files, 165 tests passed. |
| `pnpm --filter @nestjs-pipeline/ddd-users-api test` | 104 files, 709 tests passed with local socket access. Initial sandbox run had socket/IPC EPERM failures; these were environment failures, not findings. |
| CASL `lint` and users-api `typecheck` | Both passed. |
| `pnpm lint:persistence` | Passed, 735 files checked. |
| `pnpm test:release` | Passed: workspace rebuild and 12 packed packages, including real CASL module bootstrap and smoke fixtures. No publication. |
| Targeted auth/CASL e2e | 4 files, 33 tests passed: `auths`, `permissions-in-token`, `authorization-denials`, `casl-permission-source`. |
| Additional review probes | 5 new probes plus 10 existing refresh-handler tests passed, reproducing the five findings above. They assert observed defective behavior; this is not evidence that the defects are fixed. |
| `pnpm check` | Passed, 735 files checked. |

The temporary probes exercised public authorizer/JWT methods and the existing refresh-handler harness; no production seams were introduced. They were removed after execution and the original test file was restored. Only this review document remains as a repository change.

The packed build was completed before the final probe run, so the users-api imports exercised freshly built CASL code. Existing green suites verify their covered cases; they do not establish the missing expiry, cutover, failure-recovery or concurrency guarantees.

**Not run:** the entire e2e suite, the PostgreSQL-specific migration/concurrency suite, and a production deployment upgrade. Permission migrations and projector behavior were covered by the existing users-api test suite; the targeted e2e covered permission updates and role deletion. No external documentation or old review result was substituted for current execution evidence.

## 4. Suggested repair sequence

1. Define the v2 credential acceptance/cutover contract, require expiry and new-generation identity, and add independent legacy-token and missing-expiry tests.
2. Repair historical reuse revocation under conflicts. Validate the transition with real separate persistence contexts before changing other refresh behavior.
3. Move avoidable token preparation ahead of the rotation commit and retain all grace/concurrency guarantees. Explicitly document the residual lost-response behavior.
4. Align the public projection root shape with its types and run the packed consumer again.
5. Decide the revocation-event contract before adding event subscribers, and keep the materialized-rule writer obligation in every future assignment operation.

No production fixes are included in this review.

## 5. Compatibility against the tagged release commit

Comparison: `3fc81b858dd4d7e139fb662307a5ffdef3a06675` → `9b7b17ac5d481bf2fab3619dfcb57d1640f6b6b8`.

**This is a breaking upgrade, not a drop-in replacement.** The baseline is an ancestor of the reviewed commit, with 88 intervening commits. Consequently, not every difference below was introduced by CASL v2 itself.

### Release tags verified locally

All these Git tags point exactly to `3fc81b8`:

- `v0.1.18`
- `@nestjs-pipeline/core@0.1.18`
- `@nestjs-pipeline/casl@0.1.1`
- `@nestjs-pipeline/correlation@0.1.8`
- `@nestjs-pipeline/opentelemetry@0.1.8`
- `@nestjs-pipeline/zod@0.1.6`

No local tag points exactly to `9b7b17a`. Tags establish repository release markers; npm publication and remote GitHub release status were not checked.

### Confirmed consumer-facing breaks

Scope: supported public API only, in priority order core, correlation, OpenTelemetry, Zod, CASL. Internal bootstrap APIs, internal tokens, users-api and private DDD code are excluded. An exported symbol marked `@internal` is not counted as supported public API here. In particular, `setCorrelationFallback` was marked `@internal` at the baseline; its removal is excluded.

| Surface | Tagged baseline → reviewed snapshot | Required migration |
| --- | --- | --- |
| Core context | Removes `originalCorrelationId`; `correlationId` becomes read-only, implemented as a getter. | Read `correlationId`; configure its factory/runner instead of assigning it in a behavior. Old assignments can fail at runtime, not only typecheck. |
| Core logger configuration | `loggerProvider` narrows from arbitrary Nest `Provider` to a provider binding `LOGGING_BEHAVIOR_LOGGER`. | Existing correctly typed logger providers continue to work; broadly typed `Provider` variables may need narrowing. |
| Correlation payload helper | `addCorrelationId()` now rejects non-plain objects, including class instances it previously spread into a plain object. | Pass a plain payload object, e.g. `{ ...instance }`, or wrap the instance deliberately. Ordinary plain-object callers are unaffected. |
| OpenTelemetry | No removed supported export or incompatible existing option identified in this comparison; the Nest 11/core peer requirements change. | Existing Nest 11 consumers using the supported tracing API have no identified source migration here; Nest 10 installations must upgrade dependencies. |
| Zod | Removes `ZOD_SCHEMA`; parsing now applies successful object output to the existing request, including coercions/defaults and removal of omitted schema fields. | Import `ZOD_SCHEMA_KEY`; verify handlers against parsed output rather than untouched raw inputs. Non-record top-level transform output is rejected. `ZodPipe.transform()` also becomes asynchronous: direct callers must await it; Nest handles async pipes. |
| CASL module configuration | `roleProvider`, `userContextResolver`, and `userCapabilityProvider` are replaced by required `permissionSource`. | Implement `ICaslPermissionSource`, returning a principal and flat rules; bind it through `CaslModule.forRoot`. |
| CASL exported APIs | Removes `IRoleProvider`, `IUserContextResolver`, `IUserCapabilityProvider`, `StaticRoleProvider`, `RoleDefinition`, `UserCapabilities`, `CaslUserContext`, their old provider/context tokens, `capabilityToRawRule`, `capabilitiesToRawRules`, and `buildAbilityFromRules`. | Replace old imports and integrations. Domain-specific role/assignment shapes belong in the consuming application. |
| CASL `buildAbility` | `buildAbility(roles, user?, additional?, denied?)` becomes `buildAbility(rules, principal?)`. | Flatten source rules; explicitly mark denials as inverted. Passing role definitions to the new function is not compatible. |
| CASL precedence | The baseline composes role rules and later per-user overrides; the new builder places all inverted rules after all direct rules. | Test policies where a later allow previously overrode an earlier deny. The new deny-wins policy can deny previously permitted operations. |
| CASL behavior options | Removes `subjectFromRequest`, `fieldsFromRequest`, `skipCheck`, and `prebuiltAbility`; requirements are a non-empty `rules` tuple. | Use `requires(...)` for type checks and entity/field checks inside handlers. Do not simply delete request-field options and omit their replacement checks. |
| CASL peer dependency | Advertised `@casl/ability` peer changes from `^6.0.0` to `^7.0.0`. | Upgrade CASL and verify policy behavior. The baseline already used CASL 7 as a development dependency, but its published peer contract advertised 6. |
| Nest peer support | The five packages at this release baseline now require Nest 11; their old ranges accepted Nest 10. | Upgrade Nest consistently, or remain on the old package line. Correlation also gains a required core peer. |

This is a confirmed breaking-change inventory, not a claim of exhaustive compatibility testing for all 88 commits. It was derived from both Git snapshots' source, manifests and public barrels. The previous verification section tests the new implementation; it does not compile an unchanged application from the old release.

### Versioning assessment

| Package | Baseline manifest | Reviewed manifest | Assessment |
| --- | --- | --- | --- |
| `@nestjs-pipeline/casl` | `0.1.1` | `0.2.0` | Appropriate separate pre-1.0 minor line for the intentional rewrite. |
| `@nestjs-pipeline/core` | `0.1.18` | `0.1.19` | Patch increment does not communicate removed APIs/context changes; recommend a separate minor line. |
| `@nestjs-pipeline/correlation` | `0.1.8` | `0.1.9` | Public payload acceptance narrows and peer requirements change; internal fallback removal is excluded. Recommend a separate minor line. |
| `@nestjs-pipeline/zod` | `0.1.6` | `0.1.7` | Patch increment accompanies export removal and changed parsing behavior; recommend a separate minor line. |
| `@nestjs-pipeline/opentelemetry` | `0.1.8` | `0.1.9` | Public barrel is additive, but dropping Nest 10 support is still a consumer compatibility break; recommend a separate minor line. |

Pre-1.0 status permits instability, but consumers using caret ranges such as `^0.1.18` can still receive later `0.1.x` releases. A commit message containing `!` does not protect those consumers. If the package versions have not been published, put these breaking releases on a documented `0.2.x` line and align their core peer ranges. If already published, first check registry state and choose new versions; do not attempt to overwrite a published version.

The core, Zod, correlation and OpenTelemetry source changes above predate `9b7b17a`: its own parent-to-commit diff does not modify those package directories. CASL v2 introduces the new CASL contract and associated application changes, while the upgrade from the tagged baseline includes both sets of changes.
