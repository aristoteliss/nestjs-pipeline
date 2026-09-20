# CASL authorization review

Repository: `aristoteliss/nestjs-pipeline`
Branch: `review/remaining-findings`
Reviewed HEAD: `3f5951169e232ae89075678d2c77f27cd64e007b`
Review date: 2026-09-21
Companion: [`CASL.v2.Implementation.Plan.md`](./CASL.v2.Implementation.Plan.md) (the implementation plan that superseded the earlier implementation brief)

Scope: `packages/pipeline-casl` and its use in `ddd/users-api`. This is a design and authorization-boundary review, not a full security audit (authentication, token revocation, persistence races, jobs and unrelated endpoints are out of scope). No production source was changed by this review.

## 1. Verdict

**Keep CASL. Keep the pipeline package. Repair four reproduced read-boundary defects, make the everyday authorizer vocabulary smaller, and correct documentation that contradicts the code.**

The package is not meaningless. It does four things that plain CASL calls in handlers would force every handler, or every application, to re-implement:

1. Resolve identity and persisted capabilities through replaceable providers and build one ability per request.
2. Share that ability between the pipeline (coarse admission) and the handler (loaded-resource decisions) without threading it through call signatures.
3. Raise transport-neutral `UnauthorizedActionException` details, so the application layer never throws HTTP errors.
4. Mask response data by field.

It is, however, more complicated to *learn* than to *use*. The complexity that is not earning its keep is concentrated in the teaching surface, not in the runtime design:

- `CaslAuthorizer` exposes `authorize` (four overload signatures), `project` (three), `filter` (two), `can`, a three-signature constructor and `static bypass()`. The same method name means "check a write", "return a snapshot", "mask a read" and "select fields".
- `authorize<T>` lets the caller choose the return type. The class's own JSDoc example teaches `authorize<UserDto>('read', user)`, which promises fields that the runtime may have removed.
- `authorize('read', x, ['email'])` accepts a field array and silently ignores it.
- The README (967 lines) contradicts the implementation on parent-field inheritance, still documents an `entity.authorize(...)` method that no longer exists, and calls an optional module option required.

Plain CASL directly in handlers would be a sound choice for a small application with a handful of static roles, no persisted capabilities and no field-masked responses. That is not the contract of this library, and replacing it would mean rebuilding provider wiring, capability encoding and pipeline integration in every consumer.

## 2. Evidence labels

- **Reproduced:** executed against code built from the reviewed commit. The qualifier says what was real and what was stubbed.
- **Code-path:** established by reading control flow; not executed end to end.
- **Contract risk:** implementation and a documented or typed promise differ.
- **Proposal:** a design choice, not proof of a defect.

Environment: Node 22.22.2, pnpm 9.15.9, dependencies installed with `--ignore-scripts` because the sandbox cannot download native build headers. Database-backed and container-backed suites were therefore not run (see section 9).

## 3. What exists and what it costs

| Area | Size at the reviewed commit | Assessment |
| --- | --- | --- |
| `casl.behavior.ts` | 778 lines | Sound pipeline boundary; much of the length is documentation. |
| `entity-authorization.helper.ts` | 592 lines | Useful adapter; over-broad primary API. |
| `field-projection.helper.ts` | 142 lines | Custom recursive projector. Real behavior, real maintenance cost. |
| `capability.helpers.ts` | 525 lines | Reusable capability encoding/validation; justified for persisted capabilities. |
| Package production total | 3,424 lines | |
| Package specs | 4,251 lines | Strong coverage; baseline 260 tests pass. |
| Package README | 967 lines | Too long; contains false statements (C-08). |
| users-api | 11 handler files call the authorizer | Small per-handler ceremony. |

The per-handler cost is low: one declaration and one or two authorizer calls. The cost is in what a reader must understand to use those calls correctly.

Not exercised anywhere in shipped configuration: dotted or indexed field rules. No role, seed or handler in the repository uses them. The nested and array projection machinery therefore serves hypothetical library consumers only. That is a legitimate reason to keep it (this repository's own rules protect published contracts), but it is the least exercised and most expensive part of the package to reason about.

## 4. Findings

Each finding was verified independently for this review. "Executed" means a temporary spec was run and then deleted.

| ID | Finding | Evidence | Priority |
| --- | --- | --- | --- |
| C-01 | Overview ignores field rules on `UserCapabilities`. | Reproduced (real handler and real `CaslAuthorizer`; repositories mocked) | High |
| C-02 | Ordinary `GetUser` authorizes a cached snapshot. | Reproduced (real handler, repository decorator and `MemoryCache`; persistence stubbed) | High |
| C-03 | `GetUserContextHandler` has only a type-level check. | Reproduced (handler) plus type/instance divergence executed | Medium |
| C-04 | `GetUserCapabilitiesHandler` is ungated on the bus; its stated reason is stale. | Code-path; login path verified to bypass it | Medium |
| C-05 | `authorize<T>` and `filter<T>` return caller-chosen types; `Projected<T>` mistypes readonly arrays. | Reproduced (runtime) and compiled (types) | Medium |
| C-06 | `authorize('read', x, fields)` silently ignores `fields`. | Reproduced | Medium |
| C-07 | Projection inherits parent grants; `can()` on a leaf does not. Docs say the opposite. | Reproduced | Medium (documentation) |
| C-08 | README and JSDoc contain false or obsolete statements. | Verified against source | Low |
| C-09 | Create/update HTTP responses are built from the written aggregate, not read-filtered. | Code-path | Owner decision (D-1) |
| C-10 | Example app configures `defaultFieldsFromRequest`, which nothing can use. | Verified | Low |

### C-01 Overview ignores `UserCapabilities` field rules

`GetUserOverviewHandler.readablePermissions` performs a fieldless `can('read', userCapabilitiesSubject(userId))`. A fieldless check passes when *any* rule grants the action, so field-level rules on the capability bag are never consulted. Executed results:

| Rules (besides `read User`) | Expected | Observed |
| --- | --- | --- |
| deny `UserCapabilities.additionalCapabilities` | no `capabilities` | `capabilities: ["Deploy|create|*"]` returned |
| deny `UserCapabilities.roles` | no `roles` | `roles: ["developer"]` returned |
| allow `UserCapabilities` fields `['roles']` only | no `capabilities` | `capabilities: ["Deploy|create|*"]` returned |

The recorded closure of N-01 states that roles and additional capabilities require `read` on `UserCapabilities`. That is true at resource level and remains true. The field-level part was never enforced.

### C-02 Ordinary User reads authorize a stale snapshot

`GetUserHandler` calls `queryRepository.find(query)` without `refresh`. `GetUserQueryRepository` caches by id. With the cache warmed for a user in `engineering` and persistence changed to `sales`, an engineering-scoped viewer was authorized against the cached record: one persistence read in total, `returnedDepartment: "engineering"`, `storedDepartment: "sales"`.

Qualifications, because they change the severity:

- This reproduces the stale-snapshot decision path. Producing that state in deployment needs a failed invalidation or an external writer; the repository documents that database and cache are not atomic.
- Only the two single-entity reads are cached. `GetUsersQueryRepository` and `GetRolesQueryRepository` have no `@FromCache`, and `MikroOrmStore.em` returns a fresh fork per call when no request context exists (none is registered), so their identity map is empty each time.
- `GetRoleQueryRepository.find` does not forward `query.refresh` to `em.findOne`, although the User repository does. With a fresh fork this is a parity gap rather than a demonstrated staleness source.
- `CaslUserContextResolver` already reads the user through an uncached `findOne`; it needs no change.

### C-03 User context query

`GetUserContextHandler` declares only `read User` at type level and returns whatever the repository port returns. Executed: `can('read', 'User')` is `true` for a rule limited to `department: engineering`, while the loaded-entity check for a `sales` user is `false`; the handler returned the `sales` department. The existing unit test asserts the handler returns `capabilities.roles` from its port for any caller.

### C-04 Capability query

`GetUserCapabilitiesHandler` is deliberately ungated according to `query-authorization-coverage.spec.ts`, which says login needs it. `UserLoginService.signToken` reads `EXT_USER_CAPABILITIES_QUERY_REPOSITORY` directly, and `login-without-nested-querybus.e2e-spec.ts` pins that no nested `QueryBus.execute()` occurs. Nothing in the repository dispatches this query on the bus, so the exception protects no caller and exposes any user's assignment bag to any bus dispatcher. Not a demonstrated HTTP exploit: no controller dispatches it.

### C-05 Result types

`authorize<{id: string; email: string}>('read', account)` compiled and, with `email` denied, returned `{ id }` typed as if `email` existed. `Projected<T>` is honest for `project`, but for a readonly array property it resolves to `readonly (string | undefined)[]` while the runtime writes `null` for masked elements. (The mechanism is TypeScript's homomorphic array mapping, not an object with array methods; the practical defect, `undefined` versus `null`, is real.) Changing the conditional to `T extends readonly (infer U)[]` yields `(string | null)[]`.

### C-06 Read field arrays are ignored

`authorize('read', account, ['email'])` with a rule granting only `id` returned `{ id }` and did not throw, while `can('read', account, 'email')` is `false`. This is documented in JSDoc, but a field list that looks like a check and is not one is the sharpest edge in the API. It cannot be marked `@deprecated` for reads only, because the read and write forms share an overload signature.

### C-07 Projection versus `can()`

For a rule granting `fields: ['id', 'profile']`, `can('read', account, 'profile.secret')` is `false` and `project('read', account, account)` returns `profile.secret`. The projector deliberately inherits a parent grant for descendants that have no matching rule; an existing spec expects it. Three places disagree:

- the projector's own doc comment says it works "without exposing descendants through a parent grant";
- the README says a `profile` grant alone does not grant `profile.secret`;
- the code and its tests inherit.

Inheritance is defensible: a shallow pick of names from CASL's `permittedFieldsOf` would also return the whole `profile` object. The defects are the documentation and the fact that a developer who gates on `can(..., 'profile.secret')` and then projects gets a different answer. Recommended: keep the tested behavior in this revision, document it exactly, and pin it with an executable test. A stricter model would be a separately versioned behavior change.

### C-08 Documentation

README lines around 826 and 962 document `user.authorize(...)` and `entity.authorize(...)`; the domain aggregate has no such method. README line 58 lists `subjectContextPaths` as required and line 299 calls it explicit and required, while `CaslModuleOptions.subjectContextPaths` is optional. The class JSDoc teaches the caller-chosen generic (C-05).

### C-09 Write responses

`UsersController.createUser` and `updateUser` map the command's `User` aggregate through `toResponseDto`, with no CASL read decision. A principal that may update `username` but is denied `read User.email` receives `email` in the PATCH response. Write permission is not read permission. This changes an HTTP contract to fix, so it is left to the owner (D-1).

### C-10 Inert example configuration

`app.module.ts` sets `defaultFieldsFromRequest`, which `CaslBehavior` applies only when a handler declares `subjectFromRequest`. That option exists only per handler, and no handler in users-api declares it. `subjectContextPaths` is read by `CaslUserContextResolver`, but the payload branch it enables can only fire if a command object carries a `sessionUser` property, and none does; the session store is the real source. The library features stay; the example configuration is misleading.

## 5. Loaded-entity checks stay

This restates decision K-01 with a concrete demonstration. A pipeline declaration asks whether the caller holds an applicable permission for a subject *type*. The loaded check asks whether it applies to *this* resource and these fields. Executed: a `department: engineering` rule passes the type-level `can('read', 'User')` and fails the loaded `sales` user. Replacing `authorizer.authorize('update', user, fields)` with `ability.can('update', user, field)` changes syntax, not the requirement.

## 6. Comparison with external examples

I read the implementation files at the pinned revisions. These are evidence for design choices, not endorsements of their whole security models.

| Project (pinned revision) | What the code does | What it is evidence for |
| --- | --- | --- |
| [Docmost `SpaceAbilityFactory`](https://github.com/docmost/docmost/blob/7bef7b1a00d31991f009865ec14c8d06540eb1f0/apps/server/src/core/casl/abilities/space-ability.factory.ts) | A role switch producing action and subject-type rules; no conditions, no fields, no loaded-resource checks. | The simple end of the spectrum. Direct CASL is enough when roles are static and responses are not field-masked. Says nothing about persisted capabilities or projection. |
| [TerraMatch `PolicyService`](https://github.com/wri/terramatch-microservices/blob/cff5106cbc3436eadf84f3f527c35288c6293c82/libs/common/src/lib/policies/policy.service.ts) and [`UserPolicy`](https://github.com/wri/terramatch-microservices/blob/cff5106cbc3436eadf84f3f527c35288c6293c82/libs/common/src/lib/policies/user.policy.ts) | A permit-or-throw `authorize(action, subject)` over per-entity policy classes; no field projection. | The value of a small assertion verb. It throws an HTTP exception from a service, which this repository's application-layer rules forbid, so only the vocabulary transfers. |
| [NestJS Ninja factory](https://github.com/nestjsninja/nestjs-authorization-casl/blob/104ef014d79903180f078eec5e0aead6e9b69b53/src/authorization/ability.factory.ts) and [guard](https://github.com/nestjsninja/nestjs-authorization-casl/blob/104ef014d79903180f078eec5e0aead6e9b69b53/src/authorization/authorization.guard.ts) | A small ability factory and a route-level guard over action/subject tuples. | Readable coarse admission. Nothing for loaded conditions, projection or CQRS boundaries. |
| [CASL `permittedFieldsOf`](https://github.com/stalniy/casl/blob/1a1301602ff26a6ee9cd91e709f958578f72c778/packages/casl-ability/src/extra/permittedFieldsOf.ts) and the [field guide](https://github.com/stalniy/casl/blob/1a1301602ff26a6ee9cd91e709f958578f72c778/docs-src/src/content/pages/guide/restricting-fields/en.md) | Returns permitted top-level field names, given a field universe when a rule names no fields. | The native way to mask flat DTOs. It has no nested paths, array aliases or null placeholders, so it is not a drop-in replacement for the projector, and the projector's extra semantics are this package's, not CASL's. |
| [NestJS authorization guide](https://docs.nestjs.com/security/authorization) | Ability factory plus policy guards. | The vocabulary consumers already know. |

None of the three application examples has field-level read projection or dynamic persisted capabilities. They support a smaller vocabulary and simple factories; they do not argue against this package, and they do not argue for removing it.

## 7. Assessment of the earlier review

An earlier review of the same commit (`CASL review and implementation brief`, 2026-09-21) reached the same headline. I re-verified its claims rather than relying on them. Agreement is high on diagnosis and lower on prescription.

| Earlier review item | Verification | Position |
| --- | --- | --- |
| Keep CASL and the pipeline package | Confirmed by section 1 reasoning | Agree |
| Loaded-entity check must stay | Confirmed (section 5) | Agree |
| `can` / `assert` / `project` as the everyday vocabulary | `assert` prototyped; behaves as specified | Agree. Caveat: it does not retire the hazardous `authorize` forms (C-06), which need documentation and guidance, not `@deprecated`. |
| Overview ignores capability field rules | Reproduced (C-01) | Agree on defect. **Disagree on fix:** per-field `can` on `roles` and `additionalCapabilities` is prototyped and sufficient; the nine-step rewrite that projects the raw assignment bag first is only needed for element-level rules such as `roles.0`, which nothing in the repository uses. |
| Ordinary User read authorizes stale data | Reproduced (C-02) | Agree on defect and on `refresh: true` for `GetUser`/`GetRole`. **Narrower scope:** list repositories are uncached with a fresh `EntityManager` fork per call, so refresh options on list handlers and an identity-map integration test add nothing here; `CaslUserContextResolver` needs no change. |
| Projection docs contradict implementation | Reproduced (C-07) | Agree, and the projector's own comment contradicts it too. Retaining inheritance is right. |
| Read generics overpromise | Reproduced (C-05) | Agree. Its description of the readonly-array mistype is imprecise; the defect is real. |
| Context and capability bus queries | Reproduced (C-03, C-04) | Agree |
| Related-data read before final check | Prototyped early `assert` | Agree |
| Seven phases in one prompt, `assert` first, README restructure | | **Disagree:** this repository's own convention is one finding per reviewable change. Six independent work items, defects first; `assert` ships first only because three repairs use it, and alone. README: correct the false statements and add a short pattern section rather than a wholesale restructure. |
| Replace `filter` with `can` + `map` for typed collections | | **Disagree:** `filter<Projected<UserSnapshot>>` is a one-token honest typing that keeps the single-pass implementation. |
| Extra authorized read after every write as a mandated phase | | **Disagree as mandated:** it changes the HTTP contract and adds a failure mode after commit. Left as owner decision D-1 with a full specification. |
| Bump `OVERVIEW_RESPONSE_POLICY_VERSION` to `v3` | Constant's own documentation says to bump on policy change | Agree |
| External example characterizations and pinned links | All linked files resolve and match the descriptions | Agree |
| Baseline test counts | CASL 260 passed; consistent | Agree |

The earlier review missed C-10, the projector comment contradicting its own code, and that the class JSDoc itself teaches the misleading generic.

## 8. Decisions

**Decided by this review**

- Keep the package and `IEntityAuthorizer`/`ENTITY_AUTHORIZER`. The token is provided by `CaslModule` but nothing in this repository consumes it; external consumers may.
- Add `assert` as a method on the concrete class only. Do not add it to `IEntityAuthorizer`: existing implementors would stop compiling.
- Retain projection inheritance in this revision; document and pin it.
- Authorized single-entity reads load fresh state; repository caches remain for callers whose use case tolerates staleness.
- Secure the context and capability bus queries; keep login and providers on repository ports (no recursion, no nested `QueryBus`).
- Do not add a policy DSL, a policy graph, a `UserAuthorizationService`, an ORM rule translator or any test-only seam.

**Owner decisions**

- **D-1 Write responses (C-09).** Options: A, re-read through the secured query and return only what the caller may read, `{}` when nothing is readable; B, document that write responses reflect the written aggregate; C, return only `{ id }`. Recommendation: B now, A as its own change when a role exists that can write but not read. The full A specification is in the brief.
- **D-2 Example configuration (C-10).** Remove `defaultFieldsFromRequest` from `app.module.ts`, or add a handler that uses `subjectFromRequest` so the option is demonstrably live. Recommendation: remove; the library feature and its package tests stay.

## 9. Verification performed

Baseline on the reviewed commit:

| Check | Result |
| --- | --- |
| `pnpm build` | Passed |
| `@nestjs-pipeline/casl` tests | 260 passed, 10 files |
| users-api focused suites (overview handler, overview cache, repository freshness, query coverage, `src/users/cqrs`) | 70 passed, 9 files |
| Reproductions R1, R2, R3, R5, V1 to V5b | Executed as described; temporary specs deleted |

Prototype of the recommended fixes on a scratch tree (a reference patch accompanies the brief; it applies cleanly to a pristine `3f59511` per `git apply --check`, and the tree was reverted afterwards):

| Check | Result |
| --- | --- |
| CASL tests | 266 passed (260 existing, 6 new) |
| users-api full unit suite | 616 passed, 102 files (3 existing tests were updated) |
| CASL and users-api `tsc --noEmit` | Clean |
| `pnpm check` and `pnpm lint:persistence` | Clean (681 files) |

Not run, and not claimed:

- `pnpm test:e2e`: needs a container runtime for Testcontainers.
- `pnpm test:release`: the consumer `pnpm install` fails with `ERR_PNPM_PEER_DEP_ISSUES` under pnpm 9.15.9. It fails identically on the unmodified baseline, so it is an environment or tool-version issue, not a result of the prototype. It must be run with the repository's intended pnpm before release.
- Native `better-sqlite3` build scripts.

Remaining limits, unchanged by any recommendation here: token-carried capability bags are not revoked immediately by fresh resource reads; a freshness check is not a transaction spanning authorization and later work; the optimistic mutation checks and event guarantees stay as documented.

## 10. Status after CASL v2

CASL v2 ([CASL.v2.Implementation.Plan.md](CASL.v2.Implementation.Plan.md), branch `feat/casl-v2`) resolved every finding and decision in this review. Section 8's reference design is superseded: `IEntityAuthorizer` / `ENTITY_AUTHORIZER`, `bypass`, `prebuiltAbility` and `skipCheck` no longer exist. `CaslAuthorizer` has three methods (`can`, a void `authorize`, `project`) and `requires(...)` declares the type-level check.

| Item | Status |
| --- | --- |
| C-01 | Fixed. The overview projects permission assignments through the `UserCapabilities` subject (policy version v3), so its field rules apply. |
| C-02 | Fixed. Reads under conditional rules load fresh state; the role repository forwards `refresh`. |
| C-03 | Removed. `GetUserContext` query, handler and repository are gone; `CaslPermissionSource` loads the principal. |
| C-04 | Removed. `GetUserCapabilitiesHandler` is gone; rules come from `user_permission_rules` in one round-trip. |
| C-05 | Fixed. The generic `authorize<T>` and `filter` are removed; `Projected<T>` handles readonly arrays. |
| C-06 | Fixed. `authorize` returns nothing and checks every requested field. |
| C-07 | Kept by design. A granted parent path authorizes its descendants; documented and pinned by tests. |
| C-08 | Fixed. The package README is rewritten for the 0.2.0 API. |
| C-09 | Fixed with option A: write responses come from a read-after-write projection; a write-only caller gets `{}`. |
| C-10 | Removed. `defaultFieldsFromRequest` and `subjectContextPaths` are gone. |
| D-1 | Decided A (read-after-write) and implemented. |
| D-2 | The example configuration was removed. |

The closing remark of section 9 no longer holds for token-carried capabilities: user access tokens are stateless and carry no grants by default. With `PERMISSIONS_IN_ACCESS_TOKEN=true` they carry rules that apply until the next refresh (5-minute access tokens).

### Open owner decisions

| Decision | Detail |
| --- | --- |
| Auth route prefix | The controller moved from `/auth` to `/auths` (cookie `Path=/auths`), as the plan specifies. Clients must change URLs, or the prefix is set back to `/auth` together with the cookie path. |
| Rebase | `feat/casl-v2` has not been rebased onto `be606e85`. |
| Push and pull requests | Nothing is pushed. PR 1 ends at `3452bd19`, PR 2 at `6fb44bf7`, PR 3 is everything after it. |

### Pre-existing gaps, not introduced by CASL v2

- `GetRolesCapabilitiesHandler` has no CASL gate on the query bus; only its controller route is protected.
- `ddd/users-api/test/` has 23 type errors; `test/` is outside the workspace typecheck.
- The codebase-map generator still lists `packages/_old`.
- `.claude/codebase-map.md` is about 50 KB of its 64 KB limit.

### Known limits of the design

- No transaction spans an authorization check and a later write.
- A logged-out access token stays valid until its `exp` (5 minutes by default).
- A writer of `user_roles` or other permission inputs that skips `UserPermissionsProjector.rebuild` leaves drift until `permissions:verify` reports it.
- Authorized pagination (filtering a page by entity rules in the query) is separate work.
- With `PERMISSIONS_IN_ACCESS_TOKEN=true`, permission, department and user-deletion changes apply at the next refresh.
