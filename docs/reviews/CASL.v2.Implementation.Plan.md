# CASL v2 — implementation plan

Audience: an LLM coding agent working alone in this repository. This file is the complete task contract. Read it fully before starting.

A companion walkthrough of the resulting runtime flow, in Greek, is `docs/reviews/CASL.v2.Flow.el.md` (read-only, not instructions).

## 0. What is being built and why

`@nestjs-pipeline/casl` is rewritten from scratch in a fresh package folder. The current package is parked, unchanged, as a reference outside the workspace. The project is alpha: breaking changes are intended, and no deprecation shims or compatibility overloads are kept.

Decisions already taken by the owner (do not revisit):

1. **Two-stage authorization stays.**
   - `CaslBehavior` does a type-level pre-check before the handler, cache and idempotency run.
   - Handlers check the loaded entity and fields with `CaslAuthorizer`.
2. **The authorizer has exactly three methods:** `can` (boolean), `authorize` (throw or pass, returns `void`) and `project` (authorize + field-masked candidate). The pipeline declaration helper is `requires(...)`, so no two exported symbols share the name `authorize`.
3. **Field projection keeps parent-grant inheritance:** a granted parent path authorizes its descendants unless one is explicitly denied. This intentionally differs from `ability.can(action, subject, 'parent.child')`.
4. **Permissions for human users originate in the database.** By default every request reads them. An opt-in flag (`PERMISSIONS_IN_ACCESS_TOKEN`, Phase 5.9) copies them into the short-lived access token, so requests need no read. They are materialized per rule and per user in `user_permission_rules`, rebuilt in the same transaction as their inputs, removed by FK cascade with their role, capability or user, and read with `ORDER BY inverted, position`. No cache stands in front of them.
5. **Authentication:**
   - a 5-minute stateless access token
   - a 14-day opaque refresh token stored hashed, rotated on every use, delivered only as an `HttpOnly` cookie
   - reuse detection with a short grace window
   - refresh rate limit keyed on tenant + client IP
6. **Service principals** (API clients) get their rules from configuration, never from the users tables.

## 1. Delivery

Three pull requests from one branch lineage. Each PR must be green on its own before the next starts.

| PR | Phases | Content |
| --- | --- | --- |
| 1 | 0, 1, 2, 3, 6 | Park the old package; new package; users-api migrated to it with permissions computed from source tables; CASL leak fixes. |
| 2 | 4, 6 | Materialized `user_permission_rules`, rebuild/verify commands, one parallel round-trip per request. |
| 3 | 5, 6 | Access + refresh tokens, and the opt-in permissions-in-token mode (5.9). |

Phase 6 (docs, context map, verification) runs at the end of **every** PR for what that PR changed.

Between Phase 1 and the end of Phase 3, users-api is expected not to compile. Do not "fix" that by keeping old APIs alive in the new package.

## 2. Ground rules (from `AGENTS.md`; binding)

- **Architecture:**
  - Handlers depend on ports/tokens, never ORM clients.
  - No Nest HTTP exceptions in application or library code.
  - No `QueryBus` inside command handlers.
  - Aggregates are mutated only through domain methods.
  - No manual event publication (`CommandBaseHandler` does it).
  - Versioned updates/deletes follow rule 13 (autocommit, `optimisticUpdate()`).
- **Tests and seams:**
  - No production export, parameter, option or branch exists only for tests; cross module boundaries with `vi.mock`.
  - A published package must not depend on `@nestjs/testing`.
- **Code style:**
  - No decorative comments, narration, history comments, or ticket/review IDs in code or test titles.
  - Every `.ts` file starts with `/* Copyright (C) 2026-present Aristotelis — see repository license. */`.
- **Tooling and workflow:**
  - pnpm only.
  - Never read `.env*` files; document variable **names** only.
  - One commit per phase (conventional style; `!` for breaking), each ending with the repository's attribution line.
  - Never push, publish or open a PR unless the owner asks.
- **When stuck:** if a verification step named below fails in a way this plan does not anticipate, stop, record it in the task file and report. Do not improvise around it.

## Phase 0 — setup

1. Read in order:
   - `CLAUDE.md`, `AGENTS.md`
   - `.agents/skills/nestjs-pipeline-architecture/SKILL.md`
   - `.claude/codebase-map.md`
   - `packages/CLAUDE.md`, `ddd/users-api/CLAUDE.md`, `ddd/core/CLAUDE.md`
2. `git status` must be clean apart from untracked `docs/reviews/*`. Create branch `feat/casl-v2` from `review/remaining-findings`.
3. Create `.claude/tasks/casl-v2.md` from `.claude/tasks/TEMPLATE.md`. Update it after every phase with the commands run and their outcomes.
4. Baseline: `pnpm install --frozen-lockfile && pnpm build && pnpm test`. Record the results. Pre-existing failures are recorded, not fixed.

## Phase 1 — park the old package

1. `git mv packages/pipeline-casl packages/_old/pipeline-casl`. `packages/*` does not match the nested folder, so it leaves the pnpm workspace; confirm this against `pnpm-workspace.yaml`.
2. In `packages/_old/pipeline-casl/package.json`:
   - set `"name": "@nestjs-pipeline/casl-old"` and `"private": true`
   - remove `publishConfig` and `prepublishOnly`
3. Add a two-line `packages/_old/pipeline-casl/README.md` header stating: reference source only, not built, tested or published. Keep the rest of that README.
4. Delete untracked build output in the moved folder (`dist/`, `coverage/`, `node_modules/`, `*.tsbuildinfo`) if present.
5. `pnpm install` so the lockfile no longer links the old folder.
6. Ensure `pnpm check`, `pnpm lint:persistence` and the context tooling ignore or tolerate `packages/_old/`:
   - If Biome lints it and fails only because it now sits outside the workspace, add `packages/_old` to Biome's ignore list.
   - Do not change any other tool configuration.
7. Commit: `chore(casl)!: park the current CASL package as a reference outside the workspace`.

## Phase 2 — the new `@nestjs-pipeline/casl` package

### 2.1 Package shell

Create `packages/pipeline-casl/`, copying these files from `packages/_old/pipeline-casl/` and then editing them:

- `package.json`:
  - keep `"name": "@nestjs-pipeline/casl"`, the peer dependencies and the scripts
  - set `"version": "0.2.0"`
  - update `description` to "CASL authorization behavior and entity authorizer for @nestjs-pipeline/core"
- `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts` as-is.
- Run the repository's `pnpm copy-licenses` to produce `LICENSE` and `COMMERCIAL_LICENSE.txt`.

Do **not** copy `demo-roles.yml`, `demo-seed.sql` or any `src/` file wholesale. Specific algorithms are ported explicitly below; everything else is written new.

### 2.2 Layout (follows `packages/CLAUDE.md`)

```
src/
  index.ts                               public surface (only entry)
  casl.behavior.ts                       CaslBehavior, CaslBehaviorOptions, CASL_BEHAVIOR_ID
  casl.module.ts                         CaslModule.forRoot, CaslModuleOptions
  constants/tokens.ts                    CASL_ABILITY_KEY, CASL_PRINCIPAL_KEY, CASL_PERMISSION_SOURCE, CASL_ACTIONS, CASL_SUBJECTS
  errors/unauthorized-action.exception.ts UnauthorizedActionException, UnauthorizedActionDetails
  interfaces/permission-source.interface.ts ICaslPermissionSource, CaslPrincipal, CaslAuthorizationInput
  types/casl.types.ts                    Capability, CapabilityString, AbilityRequirement, AppAbility, AppRawRule, Projected
  helpers/capability.ts                  parseCapabilityString, serializeCapability, normalizeCapability
  helpers/ability.ts                     buildAbility, interpolateConditions
  helpers/projection.ts                  projectPermittedFields (internal, not exported from index)
  helpers/authorizer.ts                  CaslAuthorizer, getCaslAbility, getCaslPrincipal, hasEntityConditions
  helpers/requires.ts                    requires()
```

Specs sit beside their source as `*.spec.ts`.

### 2.3 Public surface (`src/index.ts` exports exactly these)

`CaslBehavior`, `CaslBehaviorOptions`, `CASL_BEHAVIOR_ID`, `CaslModule`, `CaslModuleOptions`, `CASL_ABILITY_KEY`, `CASL_PRINCIPAL_KEY`, `CASL_PERMISSION_SOURCE`, `CASL_ACTIONS`, `CASL_SUBJECTS`, `CaslAction`, `CaslSubject`, `UnauthorizedActionException`, `UnauthorizedActionDetails`, `ICaslPermissionSource`, `CaslPrincipal`, `CaslAuthorizationInput`, `Capability`, `CapabilityString`, `AbilityRequirement`, `AppAbility`, `AppRawRule`, `Projected`, `parseCapabilityString`, `serializeCapability`, `normalizeCapability`, `buildAbility`, `interpolateConditions`, `CaslAuthorizer`, `getCaslAbility`, `getCaslPrincipal`, `hasEntityConditions`, `requires`.

Nothing else. Explicitly gone:

- roles/role providers/`RoleDefinition`/`StaticRoleProvider`
- `UserCapabilities` and user-capability providers
- user-context resolvers and `CaslUserContext`
- `buildAbilityFromRules`, `buildBypassAbility`, `capabilitiesToRawRules`
- `subjectContextPaths`, `fieldsFromRequest`, `subjectFromRequest`, `skipCheck`, `prebuiltAbility`
- `IEntityAuthorizer`/`ENTITY_AUTHORIZER`
- the old snapshot-returning `authorize` overloads, `filter`, select and bypass on the authorizer (the new `CaslAuthorizer.authorize` is the void check in 2.8)
- the old `authorize()` pipeline helper (replaced by `requires()`)

### 2.4 Types and constants

```ts
// types/casl.types.ts
import type { MongoAbility, RawRuleOf } from '@casl/ability';

/** One permission rule. `conditions` may contain `${user.<path>}` placeholders. */
export interface Capability {
  subject: string;
  action: string;
  conditions?: Record<string, unknown>;
  fields?: string[];
  inverted?: boolean;
  reason?: string;
}

/** Compact form: `[!]subject|action[|conditions[|fields[|reason]]]`. */
export type CapabilityString = string;

export interface AbilityRequirement {
  action: string;
  subject: string;
  field?: string;
}

export type AppAbility = MongoAbility<[string, string]>;
export type AppRawRule = RawRuleOf<AppAbility>;

/** A candidate after field projection: every property may be absent; denied array items become null. */
export type Projected<T> = T extends Date
  ? T
  : T extends readonly (infer U)[]
    ? (Projected<U> | null)[]
    : T extends object
      ? { [K in keyof T]?: Projected<T[K]> }
      : T;
```

```ts
// interfaces/permission-source.interface.ts
import type { IPipelineContext } from '@nestjs-pipeline/core';
import type { Capability } from '../types/casl.types';

/** The authenticated caller. Attributes are available to `${user.<path>}` placeholders. */
export interface CaslPrincipal {
  readonly id: string;
  readonly [attribute: string]: unknown;
}

export interface CaslAuthorizationInput {
  readonly principal: CaslPrincipal;
  /** The caller's rules in any order; direct rules are applied before inverted ones. */
  readonly rules: readonly Capability[];
}

/**
 * Application port: resolves the caller and their rules for one pipeline
 * execution. Return `null` when the caller is unauthenticated.
 */
export interface ICaslPermissionSource {
  load(context: IPipelineContext): Promise<CaslAuthorizationInput | null>;
}
```

`constants/tokens.ts`:

- `CASL_ABILITY_KEY` and `CASL_PRINCIPAL_KEY`: `Symbol.for('@nestjs-pipeline/casl:ability')` / `…:principal`.
- `CASL_PERMISSION_SOURCE = Symbol.for('@nestjs-pipeline/casl:permission-source')`.
- `CASL_ACTIONS` and `CASL_SUBJECTS`: copy the values of the old constants unchanged (users-api spreads them).

`errors/unauthorized-action.exception.ts`: port the old `UnauthorizedActionException` and `UnauthorizedActionDetails` **unchanged** (same class name, fields and message format). users-api's filter maps it to 403.

### 2.5 Capability codec (`helpers/capability.ts`) — port

Port `parseCapabilityString`, `serializeCapability` and `normalizeCapability` from `packages/_old/pipeline-casl/src/helpers/capability.helpers.ts`, including:

- the `~`-prefixed base64url escaping for delimiter-bearing segments
- `*` handling
- the `!` prefix
- all validation errors

Port their spec cases from `packages/_old/pipeline-casl/src/capability.helpers.spec.ts`. The string format is the configuration format for service principals and seeds.

### 2.6 Ability (`helpers/ability.ts`)

- **`interpolateConditions`:** port verbatim from the old helper, with the parameter renamed to `principal: CaslPrincipal`. Keep:
  - `${…}` and `{{ … }}` syntaxes
  - optional `user.` prefix stripping
  - whole-string type preservation
  - nested arrays/objects
  - own-property path walking
  - the fail-closed error on a missing property
- **`buildAbility`:** new, replacing role/additional/denied composition:

```ts
/**
 * Builds the ability for one caller. Every direct rule precedes every inverted
 * rule (stable within each group), so a deny from any source wins over an allow.
 * Placeholders resolve against `principal`; a missing attribute throws.
 */
export function buildAbility(
  rules: readonly (Capability | CapabilityString)[],
  principal?: CaslPrincipal,
): AppAbility {
  const normalized = rules.map(normalizeCapability);
  const ordered = [
    ...normalized.filter((rule) => !rule.inverted),
    ...normalized.filter((rule) => rule.inverted),
  ];
  return createMongoAbility<[string, string]>(
    ordered.map((rule) => toRawRule(rule, principal)),
  );
}
```

`toRawRule` is a private port of the old `capabilityToRawRule`. It keeps the `TypeError` for an allow rule with an empty `fields` list and interpolates only when a principal is given.

### 2.7 Projection (`helpers/projection.ts`) — port

Port `projectPermittedFields` from `packages/_old/pipeline-casl/src/helpers/field-projection.helper.ts` **without behavior change**. Replace its JSDoc with:

> Projects a snapshot to the fields `ability` permits for `action`. Conditions are evaluated against the full subject. A granted parent path authorizes its descendants unless a descendant is explicitly denied; this differs from `ability.can(action, subject, 'parent.child')`, which needs `parent.*`/`parent.**`. Denied array elements become `null`. Cyclic input and more than 1024 path aliases throw.

Port every projection case from the old `entity-authorization.helper.spec.ts` and `casl.prebuilt-ability.spec.ts` that exercises projection, rewriting the calls to `CaslAuthorizer.project`. Add:

- the parent-grant case: `fields:['profile']` → `project` includes `profile.secret` while `can(…,'profile.secret')` is `false`
- the explicit child denial case
- the `readonly string[]` type case, asserted exactly: `expectTypeOf<Projected<{ tags: readonly string[] }>['tags']>().toEqualTypeOf<(string | null)[] | undefined>()` (masked elements are `null` at runtime, never `undefined`)

### 2.8 Authorizer (`helpers/authorizer.ts`)

```ts
import { subject as caslSubject } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';

/** The ability `CaslBehavior` built for the current pipeline execution. */
export function getCaslAbility(context?: IPipelineContext): AppAbility | undefined {
  const ctx = context ?? pipelineStore.getStore();
  return ctx?.items.get(CASL_ABILITY_KEY) as AppAbility | undefined;
}

/** The principal that ability was built for; derive security-scoped keys from it. */
export function getCaslPrincipal(context?: IPipelineContext): CaslPrincipal | undefined {
  const ctx = context ?? pipelineStore.getStore();
  return ctx?.items.get(CASL_PRINCIPAL_KEY) as CaslPrincipal | undefined;
}

/**
 * Entity- and field-level authorization against the request ability.
 *
 * Uses the constructor ability, else the ambient ability stored by
 * `CaslBehavior`. A missing ability denies.
 */
@Injectable()
export class CaslAuthorizer {
  constructor(private readonly ability?: AppAbility) {}

  can(action: string, subject: object | string, field?: string): boolean {
    const ability = this.ability ?? getCaslAbility();
    if (!ability) return false;
    const { typedSubject } = resolveSubject(subject);
    return field
      ? ability.can(action, typedSubject, field)
      : ability.can(action, typedSubject);
  }

  /** Throws unless `action` is permitted on `subject` and every listed field. */
  authorize(action: string, subject: object | string, fields?: readonly string[]): void {
    const { ability, subjectType, entityId, typedSubject } = this.permitted(action, subject);
    for (const field of fields ?? []) {
      if (!ability.can(action, typedSubject, field)) {
        throw denied(action, subjectType, entityId, ` field "${field}"`, [field]);
      }
    }
  }

  /**
   * Asserts `action` on `subject`, then returns the `candidate` fields the
   * ability permits. Conditions use `subject`, never `candidate`.
   */
  project<TCandidate extends object>(
    action: string,
    subject: object | string,
    candidate: TCandidate,
  ): Projected<TCandidate> {
    if (!candidate || typeof candidate !== 'object') {
      throw new TypeError('CaslAuthorizer.project() requires a candidate object.');
    }
    const { ability, typedSubject } = this.permitted(action, subject);
    return projectPermittedFields(
      ability,
      action,
      typedSubject,
      toSnapshot(candidate) as Record<string, unknown>,
    ) as Projected<TCandidate>;
  }

  private permitted(action: string, subject: object | string) {
    const ability = this.ability ?? getCaslAbility();
    const resolved = resolveSubject(subject);
    if (!ability) {
      throw denied(action, resolved.subjectType, resolved.entityId,
        ' (no authorization ability present in context)');
    }
    if (!ability.can(action, resolved.typedSubject)) {
      throw denied(action, resolved.subjectType, resolved.entityId, '');
    }
    return { ability, ...resolved };
  }
}
```

Private helpers in the same file:

- `toSnapshot(value)`: returns `value.toJSON()` when present, else `value`.
- `denied(...)`: builds `UnauthorizedActionException` with reason ``Access denied: insufficient permissions to ${action} ${subjectType}${detail}.`` and optional `fields`.
- `resolveSubject(subject)`:
  - a string → `{ subjectType: subject, typedSubject: subject }`
  - otherwise:
    - `subjectType` = the `__caslSubjectType__` tag if a non-empty string, else `constructor.name` unless it is `'Object'`, else `'Object'`
    - `record = toSnapshot(subject)`
    - `entityId = subject.id ?? record.id`
    - `typedSubject = caslSubject(subjectType, { ...record })`

`hasEntityConditions(ability, subjects, action?)`: port unchanged from the old authorizer file.

### 2.9 Behavior and module

`casl.behavior.ts`:

```ts
export const CASL_BEHAVIOR_ID = '@nestjs-pipeline/casl:CaslBehavior';

export interface CaslBehaviorOptions {
  /** Type-level requirements, all of which must pass. */
  rules: readonly [AbilityRequirement, ...AbilityRequirement[]];
}

@Injectable()
export class CaslBehavior implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_ID] = CASL_BEHAVIOR_ID;

  constructor(
    @Inject(CASL_PERMISSION_SOURCE) private readonly source: ICaslPermissionSource,
  ) {}

  async handle(context: IPipelineContext, next: NextDelegate): Promise<unknown> {
    const rules = context.getBehaviorOptions<CaslBehaviorOptions>(CaslBehavior)?.rules;
    if (!rules?.length) return next();

    const input = await this.source.load(context);
    if (!input) {
      throw new UnauthorizedActionException({
        action: rules[0].action,
        subject: rules[0].subject,
        reason: 'Access denied — authentication required.',
      });
    }

    const ability = buildAbility(input.rules, input.principal);
    context.items.set(CASL_PRINCIPAL_KEY, input.principal);
    context.items.set(CASL_ABILITY_KEY, ability);

    for (const { action, subject, field } of rules) {
      const allowed = field
        ? ability.can(action, subject, field)
        : ability.can(action, subject);
      if (!allowed) {
        throw new UnauthorizedActionException({
          action,
          subject,
          ...(field ? { fields: [field] } : {}),
        });
      }
    }
    return next();
  }
}
```

- `CASL_BEHAVIOR_ID` and the class name `CaslBehavior` must stay exactly as shown: `@nestjs-pipeline/cache` and `@nestjs-pipeline/idempotency` declare ordering constraints against `'@nestjs-pipeline/casl:CaslBehavior'` and `'CaslBehavior'`.
- Check how the old behavior imports `PIPELINE_BEHAVIOR_ID`, `IPipelineBehavior` and `NextDelegate` from `@nestjs-pipeline/core`, and do the same.

`casl.module.ts`:

```ts
export interface CaslModuleOptions {
  /** Modules whose exports the permission source provider needs (standard dynamic-module `imports`). */
  imports?: ModuleMetadata['imports'];
  permissionSource:
    | Type<ICaslPermissionSource>
    | { useClass: Type<ICaslPermissionSource> }
    | { useExisting: Type<ICaslPermissionSource> | InjectionToken }
    | {
        useFactory: (...args: never[]) => ICaslPermissionSource | Promise<ICaslPermissionSource>;
        inject?: InjectionToken[];
      };
}
```

- `CaslModule.forRoot(options)` returns a **global** dynamic module with `imports: options.imports ?? []`, providing `CaslBehavior`, `CaslAuthorizer` (`useFactory: () => new CaslAuthorizer()`) and `CASL_PERMISSION_SOURCE`, and exporting all three. `global: true` only makes these exports visible elsewhere; it does **not** give the permission source access to other modules' providers, which is why `imports` exists. Document the recommended form: an app-owned module that provides and exports the source, passed via `imports`, with `permissionSource: { useExisting: TheSource }`.
- Write the provider-conversion helper new; the old module's `toProvider` is a reference.

`helpers/requires.ts`:

```ts
/** `[CaslBehavior, { rules }]` for `@UsePipeline`; every requirement must pass. */
export function requires(
  ...rules: [AbilityRequirement, ...AbilityRequirement[]]
): PipelineBehaviorTuple<CaslBehavior, CaslBehaviorOptions> {
  return [CaslBehavior, { rules }];
}
```

### 2.10 Package tests (Vitest; no `@nestjs/testing`)

- **Behavior** (construct it directly with a stub source):
  - no rules → `next()` without calling the source
  - `null` input → the authentication-required exception, and `next` not called
  - a passing type check with a conditional rule
  - a failing requirement, with and without `field`
  - ability and principal stored in `context.items`
  - a deny from any position wins
  - a missing placeholder attribute throws
  - a permission-source failure (rejected promise) propagates **unchanged**, never converted into `UnauthorizedActionException`
  - malformed rule data from the source (e.g. an allow rule with empty `fields`) propagates as its own error, not as a denial
  - every denial is an `UnauthorizedActionException`; the package imports nothing from Nest HTTP exceptions (`biome/plugins/transport-neutral-errors.grit` stays green)
- **`CASL_BEHAVIOR_ID`** equals `'@nestjs-pipeline/casl:CaslBehavior'`, and `CaslBehavior.name === 'CaslBehavior'`.
- **`buildAbility`:**
  - allow/deny partition is stable
  - multi-source precedence regressions: `all|manage|*` from one source plus `!User|delete|*` from another → `delete User` denied (in both input orders); a role-style allow plus a user-style deny on the same rule → denied; an allow and a deny for the same user source → denied
  - interpolation, including a numeric whole-string placeholder
  - an empty-fields allow rule throws
  - string and object inputs are equivalent
- **Authorizer:**
  - `can`: allowed; denied; field; no ability → `false`
  - `authorize`:
    - entity denial
    - a conditional rule matching and not matching
    - each field checked, with the first denied field in `fields`
    - empty/absent fields → entity check only
    - no ability → the no-ability reason
    - constructor ability and ambient ability (`pipelineStore.run`)
    - `read` fields checked
    - returns `undefined` (`expectTypeOf(...).returns.toBeVoid()`)
    - subject not mutated
  - `project`: entity denial throws; conditions use the subject, not the candidate; plus the ported projection suite
- **`hasEntityConditions`:** port its old cases.
- **`requires()`:** one and several requirements; the tuple is exactly `[CaslBehavior, { rules }]`.
- **Module (unit):** each provider form maps to `CASL_PERMISSION_SOURCE`, `imports` is passed through, and `CaslAuthorizer` is exported. Construct the module definition only; no Nest testing module in the package.
- **Module (real bootstrap, packed consumer):** in `integration/packages/consumer/`, next to `two-app-lifecycle.ts`, bootstrap a Nest application context from the **packed** package with `CaslModule.forRoot({ imports: [SourceModule], permissionSource: { useExisting: FakeSource } })`, where `FakeSource` depends on a provider exported by `SourceModule`. Resolve `CaslBehavior`, run it once through a pipeline dispatch (or `handle` with a real context), and assert allow and deny. Metadata assertions alone do not satisfy this item.

### 2.11 Package README and release fixture

- Write `packages/pipeline-casl/README.md` new, covering the current contract only (target ≤ 250 lines):
  1. purpose
  2. install and peers
  3. `CaslModule.forRoot` with a minimal `ICaslPermissionSource`
  4. `@UsePipeline(requires({ action, subject }))`, and `requires(a, b)` for several requirements (AND)
  5. `authorize` for writes, `project` for responses, `can` for optional sections
  6. the capability format (object and string, placeholders, `!`, `all`, `manage`, fields)
  7. rule precedence (deny wins)
  8. projection semantics (parent inheritance, `null` placeholders, conditions on the subject)
  9. short-circuit behaviors, stated separately:
     - **response caches** key on tenant + principal (`getCaslPrincipal`) + a digest of the effective rules (`getCaslAbility().rules`) and must bypass when entity conditions can change the result (`hasEntityConditions`)
     - **idempotency** keeps a **stable operation key** (tenant + principal + operation, no permission data, so a permission change cannot run the effect twice) and binds replay with a **separate** fail-closed authorization digest compared before any stored response is returned; missing or mismatched digest refuses replay. This is the existing repository contract (`AGENTS.md` rule 5, users-api `replayScopeDigest`); do not restate it differently
  10. list authorization (`can` + `project` per item) is in-memory over an already loaded collection, not database filtering; authorized pagination needs a query-side design
  11. errors (only `UnauthorizedActionException` for denials; source and data errors propagate as-is)
- Rewrite `integration/packages/consumer/src/casl-smoke.ts` against the new API:
  - `buildAbility` with a placeholder
  - `new CaslAuthorizer(ability)`: `can`, an `authorize` allow and throw, a `project` omission
  - `parseCapabilityString` round trip

Verify:

- `pnpm --filter @nestjs-pipeline/casl build`
- `pnpm --filter @nestjs-pipeline/casl test`
- `pnpm --filter @nestjs-pipeline/casl lint`

Commit: `feat(casl)!: rewrite the CASL package around a permission source and a three-method authorizer`.

## Phase 3 — users-api on the new package (PR 1)

### 3.1 Permission source (rules computed from source tables)

New `ddd/users-api/src/auths/persistence/casl-permission.source.ts`, request-scoped, implementing `ICaslPermissionSource`. It replaces `CaslUserContextResolver`, the role provider and the user-capability provider wiring.

```ts
@Injectable({ scope: Scope.REQUEST })
export class CaslPermissionSource implements ICaslPermissionSource {
  constructor(
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
    private readonly userCapabilities: GetUserCapabilitiesQueryRepository,
    private readonly roleDefinitions: GetRolesCapabilitiesQueryRepository,
  ) {}

  async load(): Promise<CaslAuthorizationInput | null> {
    const session = getSessionUserFromStore();
    const id = session?.id?.trim();
    if (!id) return null;

    if (session.principalType === 'service') {
      return session.grants
        ? { principal: { id, principalType: 'service' }, rules: session.grants }
        : null;
    }
    if (session.principalType !== 'user') return null;

    const user = await this.store.em.findOne(User, { id });
    if (!user) return null;

    const assignments = await this.userCapabilities.find(new GetUserCapabilitiesQuery({ userId: id }));
    const roles = await this.roleDefinitions.getRoles(assignments.roles);
    return {
      principal: { id: user.id, principalType: 'user', department: user.department ?? null },
      rules: [
        ...roles.flatMap((role) => role.capabilities.map(normalizeCapability)),
        ...(assignments.additionalCapabilities ?? []).map(normalizeCapability),
        ...(assignments.deniedCapabilities ?? []).map((c) => ({ ...normalizeCapability(c), inverted: true })),
      ],
    };
  }
}
```

**App-owned types.** Move the `UserCapabilities` and `RoleDefinition` shapes the app still uses into `ddd/users-api/src/auths/application/permission-assignments.ts` as app types:

- `UserPermissionAssignments { roles: string[]; additionalCapabilities?: (Capability | CapabilityString)[]; deniedCapabilities?: … }`
- `RoleDefinition { name: string; capabilities: (Capability | CapabilityString)[] }`

Update every import that used them from the old package. Remove `implements IRoleProvider` / `IUserCapabilityProvider` from the two repositories; their queries stay.

**Module wiring.** Create `ddd/users-api/src/auths/authorization.module.ts` (`AuthorizationModule`): it provides `CaslPermissionSource`, `GetUserCapabilitiesQueryRepository` and `GetRolesCapabilitiesQueryRepository` by class, and exports `CaslPermissionSource`. Their other dependency (`MIKRO_ORM_CLIENT`) comes from the global `PersistenceModule`. **`app.module.ts`:** `CaslModule.forRoot({ imports: [AuthorizationModule], permissionSource: { useExisting: CaslPermissionSource } })`. The source is request-scoped, so `CaslBehavior` resolves per request as the old resolver-based wiring did; confirm with the bootstrap test below. Remove `roleProvider`, `userContextResolver`, `userCapabilityProvider`, `subjectContextPaths` and `defaultFieldsFromRequest`. The field checks those options performed at pipeline level are covered by the handlers' `authorizer.authorize(...)` field lists; confirm each command handler passes its accepted fields.

**Service principals:**

- `ApiClientAuthenticator` reads `API_CLIENTS` entries with `rules: CapabilityString[]` instead of `capabilities: { roles }`.
- Parse every rule with `parseCapabilityString` at startup; a malformed entry fails boot.
- Put the parsed list on the session user as `grants: Capability[]`, and add `grants?: Capability[]` to `SessionUser`.
- Update the JSDoc example in that file (no real keys) and the users-api README.

**Token claims:**

- Stop issuing `roles`/`additionalCapabilities`/`deniedCapabilities` in the login JWT (`jose-access-token.issuer.ts`).
- Stop copying capabilities into the Fastify session (`SessionService`) and the session response.
- Stop reading them in `JwtAuthenticator`.
- Delete `auths/services/capability-codec.ts` if nothing else uses it.
- Login no longer needs `GetUserCapabilitiesQuery`; remove that dependency from `UserLoginService` if unused.

**Renames:**

- `getCaslUserContext` → `getCaslPrincipal` (idempotency replay digest, overview cache policy). The digest input keeps `principal`, `rules` and the principal attributes.
- `buildAbilityFromRules` in tests → `buildAbility`. Where a test depended on native rule order, rewrite it against the deny-wins partition.

**Removals (orphans of this change):**

- `CaslUserContextResolver` and its spec.
- The `GetUserContextQuery`/handler/repository, and the `GetUserCapabilitiesHandler`: nothing dispatches them on the bus; `grep` first, and if a dispatcher exists, stop and report.
- Their registrations and the tests that target them (`test/user-context-resolver-split.e2e-spec.ts`, the handler cases in `test/cqrs-runtime-errors.spec.ts`, the "deliberately ungated" case in `test/query-authorization-coverage.spec.ts`).

### 3.2 Command handlers use the new `authorize`

In these six handlers, keep `this.authorizer.authorize(<same args>)`; with the new package it is the void permit-or-throw check. Make sure no call site uses its return value, and keep order and return values identical:

- `users/cqrs/commands/{create,update,delete}-user.handler.ts`
- `roles/cqrs/commands/{create,update,delete}-role.handler.ts`

Authorization stays after the authoritative load and before mutation/save. Existing command spec scenarios must still pass; only their ability construction changes to `buildAbility`.

### 3.3 Honest read models and state-dependent read freshness

#### New files

`ddd/users-api/src/users/application/user-read-model.ts`:

```ts
/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { CaslAuthorizer, Projected } from '@nestjs-pipeline/casl';
import type { User } from '../domain/models/user.entity';

interface UserReadCandidate {
  id: string;
  username: string;
  email: string;
  department?: string | null;
}

/** The fields of a User the current caller may read; any field can be absent. */
export type UserReadModel = Projected<UserReadCandidate>;

export function projectUserRead(
  authorizer: CaslAuthorizer,
  user: User,
): UserReadModel {
  return authorizer.project('read', user, {
    id: user.id,
    username: user.username,
    email: user.email,
    department: user.department,
  });
}
```

`ddd/users-api/src/roles/application/role-read-model.ts` follows the same pattern with `{ id, name }` → `RoleReadModel`, `projectRoleRead`. Create the directory.

`ddd/users-api/src/common/cqrs/helpers/read-freshness.helper.ts`:

```ts
/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { APP_ACTIONS, type AppSubject } from '@common/constants';
import { getCaslAbility, hasEntityConditions } from '@nestjs-pipeline/casl';

/**
 * True when the current caller's read decision on `subject` depends on entity
 * attributes, so a cached snapshot must not decide it.
 */
export function readDependsOnEntityState(subject: AppSubject): boolean {
  const ability = getCaslAbility();
  return !ability || hasEntityConditions(ability, [subject], APP_ACTIONS.READ);
}
```

#### Handlers

`GetUserHandler`:

```ts
async execute(query: GetUserQuery): Promise<UserReadModel | null> {
  const user = await this.queryRepository.find(
    readDependsOnEntityState(APP_SUBJECTS.USER) && !query.refresh
      ? new GetUserQuery(
          { userId: query.userId, email: query.email, department: query.department },
          { hydrate: query.hydrate, refresh: true },
          query.sessionUser,
        )
      : query,
  );
  return user ? projectUserRead(this.authorizer, user) : null;
}
```

- First read `createQuery`/`BaseQuery` in `ddd/core/application`, and preserve every option and the `sessionUser` argument the incoming query carries.
- Confirm that `@FromCache` in `ddd/core` bypasses the cached read when `refresh` is set. If it does not, stop and report.
- Change `implements IQueryHandler<GetUserQuery, UserReadModel | null>`.

`GetUsersHandler` (this repository has no cache, so there is no refresh):

```ts
async execute(query: GetUsersQuery): Promise<UserReadModel[]> {
  const users = await this.queryRepository.find(query);
  return users
    .filter((user) => this.authorizer.can(APP_ACTIONS.READ, user))
    .map((user) => projectUserRead(this.authorizer, user));
}
```

Remove the `User.from(raw)` pass: the repository returns `User[]`, and `RootEntity.from` returns the same instance.

`GetRoleHandler` and `GetRolesHandler`: same shape with `APP_SUBJECTS.ROLE`, `GetRoleQuery({ roleId }, { refresh: true })`, `projectRoleRead` and `RoleReadModel`. Remove `Role.from(raw)`.

`GetRoleQueryRepository.find`: forward refresh to the ORM, as `GetUserQueryRepository` does:

```ts
const role = await this.store.em.findOne(
  Role,
  buildConditions(query),
  query.refresh ? { refresh: true } : undefined,
);
```

#### Presentation types

- `users.controller.ts`: `QueryBus.execute<GetUserQuery, UserReadModel | null>` and `<GetUsersQuery, UserReadModel[]>`.
- `toResponseDto`: accept `User | UserSnapshot | UserReadModel | null`. Every schema field is already optional.
- Apply the same to `roles.controller.ts` and `toRoleResponseDto`. If the role response schema has a required field, make it optional. Never fill an omitted field from elsewhere.
- No `as UserSnapshot` casts.

#### Tests

- In `ddd/users-api/test/`, modeled on `overview-repository-cache-freshness.spec.ts`:
  1. Real `GetUserQueryRepository` + real `MemoryCache` + stubbed ORM: warm the cache with `department: engineering`, change the stub to `sales`, execute `GetUserHandler` under `read User {department: engineering}` → `UnauthorizedActionException`. Under `{department: sales}` → allowed.
  2. An unconditional `read User` is served from the cache (ORM stub called once).
- A Role equivalent, plus a `GetRoleQueryRepository` spec asserting `em.findOne` receives `{ refresh: true }` when `query.refresh`.
- Lists: hidden rows absent, denied fields omitted, and an empty array when nothing is readable.

### 3.4 Repair the overview

File: `users/cqrs/queries/get-user-overview.handler.ts`. `UserOverviewDto` stays unchanged. Replace `execute`, `readablePermissions` and `readableRoleNames` with:

```ts
  async execute(query: GetUserOverviewQuery): Promise<UserOverviewDto | null> {
    const user = await this.users.find(
      new GetUserQuery({ userId: query.userId }, { refresh: true }),
    );
    if (!user) return null;
    this.authorizer.authorize(APP_ACTIONS.READ, user);

    const candidate: UserOverviewDto = {
      id: user.id,
      username: user.username,
      email: user.email,
      department: user.department,
      ...(await this.readablePermissions(user.id)),
    };

    return this.authorizer.project('read', user, candidate);
  }

  private async readablePermissions(
    userId: string,
  ): Promise<Pick<UserOverviewDto, 'roles' | 'capabilities'>> {
    const permissions = userCapabilitiesSubject(userId);
    if (!this.authorizer.can(APP_ACTIONS.READ, permissions)) return {};

    const assignments = await this.capabilities.find(
      new GetUserCapabilitiesQuery({ userId }),
    );
    const readable = this.authorizer.project(APP_ACTIONS.READ, permissions, {
      roles: assignments?.roles ?? [],
      additionalCapabilities: assignments?.additionalCapabilities ?? [],
    });

    return {
      ...(readable.roles
        ? { roles: await this.readableRoleNames(readable.roles) }
        : {}),
      ...(readable.additionalCapabilities
        ? { capabilities: readable.additionalCapabilities.map(capabilityLabel) }
        : {}),
    };
  }

  private async readableRoleNames(
    names: readonly (string | null | undefined)[],
  ): Promise<(string | null)[]> {
    const wanted = names.filter((name): name is string => typeof name === 'string');
    if (wanted.length === 0) return names.map(() => null);

    const loaded = await this.roles.find(new GetRolesQuery({ names: wanted }));
    const byName = new Map(loaded.map((role) => [role.name, role]));

    return names
      .map((name) => (typeof name === 'string' ? name : null))
      .filter((name) => {
        if (name === null) return true;
        const role = byName.get(name);
        return (
          role !== undefined &&
          this.authorizer.can(APP_ACTIONS.READ, role) &&
          this.authorizer.can(APP_ACTIONS.READ, role, 'name')
        );
      });
  }
```

Module-level helper in the same file (not exported):

```ts
function capabilityLabel(
  entry: Projected<Capability | CapabilityString> | null | undefined,
): string | null {
  if (entry === null || entry === undefined) return null;
  if (typeof entry === 'string') return entry;
  return typeof entry.subject === 'string' && typeof entry.action === 'string'
    ? `${entry.subject}:${entry.action}`
    : null;
}
```

Import `Capability`, `CapabilityString` and `Projected` as types from `@nestjs-pipeline/casl`. The capabilities port's result type is the app's `UserPermissionAssignments` (3.1), not a package type.

Rules:

- The capability subject uses the **loaded** `user.id`.
- `deniedCapabilities` is never placed in the candidate.
- A masked slot is never reconstructed from the raw `assignments`.
- `GetRolesQuery` is not called without string names.

`user-overview-cache.policy.ts`: `OVERVIEW_RESPONSE_POLICY_VERSION = 'v3'`. Change nothing else.

Tests go in `get-user-overview.handler.spec.ts` and `test/user-overview-authorization-cache.spec.ts`:

1. The overview capability leak: `read User`, `read UserCapabilities`, inverted `read UserCapabilities additionalCapabilities` → no `capabilities` key.
2. Inverted `UserCapabilities roles` → no `roles` and the Role port not called.
2a. Allowlist variant: `read UserCapabilities` with `fields: ['roles']` only → `roles` present, no `capabilities`.
2b. `read UserCapabilities` with `fields: ['deniedCapabilities']` only → neither related key. The assignment port **is** called (the bag is loaded and projected to nothing). Do not add a field-level pre-check to skip the load: a parent `can(…, 'roles')` is `false` for descendant-only grants such as `roles.0`, so such a pre-check would drop data the projection permits.
3. Inverted `UserCapabilities additionalCapabilities.0.action` with an object capability → that slot is `null`.
4. `User roles` denied while `UserCapabilities` is allowed → no `roles`.
5. A Role without `read name` → its name is omitted.
6. Conditional `read User {department: sales}` against an engineering user → throws, and the capability and role ports are **not** called.
7. No `read UserCapabilities` → neither related port called.
8. An unrestricted overview is unchanged.
9. The cache key carries `v3`.

### 3.5 Write responses only through an authorized read

Policy: a successful write returns only what the caller may read afterwards. A write-only caller gets `{}` with the normal success status. A committed write is never reported as failed because its result is unreadable.

`users.controller.ts`:

```ts
  @Post()
  @HttpCode(201)
  async createUser(
    @Body(new ZodPipe(CreateUserDtoSchema)) dto: CreateUserDto,
  ): Promise<UserResponseDto> {
    const { id } = await this.commandBus.execute<CreateUserCommand, User>(
      CreateUserMapper.map(dto),
    );
    return this.readAfterWrite(id);
  }

  // updateUser: same, with UpdateUserMapper.map(id, dto) and readAfterWrite(id)

  private async readAfterWrite(userId: string): Promise<UserResponseDto> {
    try {
      const user = await this.queryBus.execute<GetUserQuery, UserReadModel | null>(
        new GetUserQuery({ userId }),
      );
      return user ? toResponseDto(user) : {};
    } catch (error) {
      if (error instanceof UnauthorizedActionException) return {};
      throw error;
    }
  }
```

Apply the same change to `roles.controller.ts` with `GetRoleQuery({ roleId })` and `toRoleResponseDto`. DELETE stays 204.

Constraints:

- On idempotent replay the command bus returns the stored JSON snapshot. It still carries `id`, which is all the controller uses, and the response is re-authorized fresh. Verify `id` is present in a replayed result; if not, stop and report.
- Command handlers keep returning the aggregate, and `CommandBaseHandler` event publication is untouched. No change to idempotency keys or replay scope.
- Catch only `UnauthorizedActionException`. Anything else propagates, so a post-commit read failure surfaces as an error. Document this.

Tests (controller specs, `test/create-command-idempotency.spec.ts`, `test/create-command-replay-scope.spec.ts`):

1. `update username` + `read username` only → `{ name }`, no `email` (the write-response leak).
2. Write-only caller → `{}` with 201/200; save and events happen exactly once.
3. The read returns `null` → `{}`.
4. An unexpected read error propagates.
5. Idempotent create replay → no second save/event; the response comes from a fresh `GetUserQuery`.
6. An unrestricted caller's response is unchanged.
7. Role equivalents of 1 and 2.

### 3.6 Phase 3 tests for the permission source and wiring

- **`CaslPermissionSource`** (stub ORM and repositories; `getSessionUserFromStore` via `vi.mock`):
  - no session → `null`
  - unknown `principalType` → `null`
  - a service with `grants` → those rules, and no ORM call
  - a service without `grants` → `null`
  - a user missing in the DB → `null`
  - a user → principal attributes (`department`) plus rules in role → additional → denied order, with denied entries forced `inverted: true`
- **Service configuration:** a malformed `API_CLIENTS` rule fails at startup.
- **Real Nest bootstrap:** a users-api test that compiles `AppModule` (or the smallest module set containing `CaslModule`, `AuthorizationModule`, `PersistenceModule`) with `@nestjs/testing`, dispatches one gated query through the real `QueryBus` for an allowed and a denied principal, and proves `CaslPermissionSource` and its repositories resolved.
- **Pipeline ordering:** `test/behavior-composition-contracts.spec.ts` still proves `CacheBehavior` and `IdempotencyBehavior` run after `CaslBehavior`.
- **Existing suites migrated to the new API:**
  - `test/user-overview-authorization-cache.spec.ts`
  - `test/overview-repository-cache-freshness.spec.ts`
  - `test/query-authorization-coverage.spec.ts`
  - `test/create-command-replay-scope.spec.ts`
  - `test/create-command-idempotency.spec.ts`
  - `test/pipeline-packages.e2e-spec.ts`
  - the command/query/controller specs
- Keep each scenario; change only the API calls.

Per-request cost after PR 1 is higher than today (the user row, then assignments, then role definitions, sequentially). PR 2 removes it. Note this in the PR 1 report; do not optimize here.

Verify for PR 1:

- `pnpm build`
- `pnpm --filter @nestjs-pipeline/casl test`
- `pnpm --filter @nestjs-pipeline/ddd-users-api typecheck`
- `pnpm --filter @nestjs-pipeline/ddd-users-api test`
- `pnpm lint:persistence`
- `pnpm check`
- `pnpm test:release`
- `pnpm test:e2e` (list the blocked suites if services are missing). It must include, on **both Express and Fastify**, a type-level denial and an entity-level denial each returning HTTP 403 through the existing `UnauthorizedActionFilter`.

Then Phase 6.

Commits for PR 1: one per subsection, so each finding is reviewable on its own. That means 3.1 (wiring and permission source), 3.2 (commands), 3.3 (read models and freshness), 3.4 (overview), 3.5 (write responses) and the removals in 3.1 as a separate commit, each green on `typecheck` and the affected tests. Final message of the series: `feat(users-api)!: authorize through the new CASL package and close read/write disclosure paths`.

**Reference scenarios.** `docs/reviews/casl-reference-prototype.patch` contains `ddd/users-api/test/authorization-read-boundaries.spec.ts`, written against the old package. Its overview and "ordinary user read uses fresh state" scenarios (real `GetUserQueryRepository` + real `MemoryCache` + a `findOne` stub) are good starting points for the 3.3 and 3.4 tests. Port them to the new API (`assert` → `authorize`, `buildAbilityFromRules` → `buildAbility`) and place them in the closest existing suites. Ignore its `GetUserContextHandler`/`GetUserCapabilitiesHandler` cases, because 3.1 deletes those handlers. Ignore its production changes, because they target the old package.

## Phase 4 — materialized permission rules (PR 2)

### 4.1 Table and entity

New migration file under `ddd/users-api/src/persistence/migrations/`, in the style of `Migration20260830000000.ts` (there is no generator script; never edit an applied migration). Encodings match the `capabilities` table:

```sql
create table user_permission_rules (
  user_id varchar(64) not null references users(id) on delete cascade,
  position integer not null,
  source varchar(16) not null,
  role_id varchar(64) null references roles(id) on delete cascade,
  capability_id varchar(64) not null references capabilities(id) on delete cascade,
  subject varchar(128) not null,
  action varchar(64) not null,
  conditions text null,
  fields text null,
  inverted boolean not null,
  reason text null,
  primary key (user_id, position)
);
create index user_permission_rules_role_id_index on user_permission_rules (role_id);
create index user_permission_rules_capability_id_index on user_permission_rules (capability_id);

-- backfill in the same migration, same ordering as the projector (4.3)
insert into user_permission_rules
  (user_id, position, source, role_id, capability_id, subject, action, conditions, fields, inverted, reason)
select user_id,
       row_number() over (partition by user_id order by grp, role_key, capability_id),
       source, role_id, capability_id, subject, action, conditions, fields, inverted, reason
from (
  select ur.user_id, 0 as grp, ur.role_id as role_key, 'role' as source, ur.role_id,
         c.id as capability_id, c.subject, c.action, c.conditions, c.fields, c.inverted, c.reason
    from user_roles ur
    join role_capabilities rc on rc.role_id = ur.role_id
    join capabilities c on c.id = rc.capability_id
  union all
  select uac.user_id, 1, '', 'additional', null,
         c.id, c.subject, c.action, c.conditions, c.fields, c.inverted, c.reason
    from user_additional_capabilities uac
    join capabilities c on c.id = uac.capability_id
  union all
  select udc.user_id, 2, '', 'denied', null,
         c.id, c.subject, c.action, c.conditions, c.fields, true, c.reason
    from user_denied_capabilities udc
    join capabilities c on c.id = udc.capability_id
) s;
```

The backfill makes the reader switch in 4.5 safe on an **existing** database: after `db:migrate`, every user already has their rules. Window functions need SQLite ≥ 3.25 and work on PostgreSQL; confirm the installed libSQL/SQLite version, and write the boolean literal in the form the existing migrations use for each dialect.

**Rollout order (document in the users-api README and the PR description):** stop or drain the old version → `db:migrate` (creates and backfills) → `permissions:verify` must exit 0 → start the new version. If verify fails, run `permissions:rebuild`, verify again, and only then start.

- `source` is `'role' | 'additional' | 'denied'`; `role_id` is set only for `'role'`.
- Implement `down()`. Extend the schema-pinning migration spec.
- Confirm that SQLite enforces these cascades exactly as it does for `user_roles`; if FK enforcement is off, stop and report.
- Add `src/persistence/entities/user-permission-rule.entity.ts` (plain class like `UserRole`) and `src/persistence/schemas/user-permission-rule.schema.ts` (composite PK `userId` + `position`). Register the schema in `postgres-options.ts` and `libsql-options.ts`.

### 4.2 Shared row mapper

Extract the capability-row → `Capability` mapping (inline today in `GetRolesCapabilitiesQueryRepository.hydrate`) into `src/persistence/capability-row.mapper.ts`:

```ts
export function capabilityFromRow(row: {
  subject: string; action: string; conditions?: string | null;
  fields?: string | null; inverted: boolean; reason?: string | null;
}): Capability {
  return {
    subject: row.subject,
    action: row.action,
    conditions: row.conditions ? JSON.parse(row.conditions) : undefined,
    inverted: row.inverted,
    reason: row.reason || undefined,
    fields: row.fields ? row.fields.split(',') : undefined,
  };
}
```

The role repository uses it with unchanged behavior, and the permission source uses it for rule rows.

### 4.3 Projector — the only writer of `user_permission_rules`

New `src/auths/persistence/user-permissions.projector.ts`:

```ts
@Injectable()
export class UserPermissionsProjector {
  /** Replaces the materialized rules of `userIds` inside the caller's transaction. */
  async rebuild(em: EntityManager, userIds: readonly string[]): Promise<void>;

  /** Users whose materialized rules differ from their source tables. */
  async findDrift(em: EntityManager, userIds?: readonly string[]): Promise<string[]>;
}
```

`rebuild`, in batches of at most 500 users:

1. Lock the users' rows in ascending id order (`LockMode.PESSIMISTIC_WRITE` on PostgreSQL; skip on SQLite if rejected).
2. With the transactional `em`, load:
   - `user_roles`
   - `role_capabilities`
   - `user_additional_capabilities` and `user_denied_capabilities`
   - every referenced `capabilities` row
3. Delete the users' `user_permission_rules`.
4. Insert one row per rule, with `position` from 1 per user:
   - role assignments sorted by **role id** (never by name, so a rename changes nothing), each role's capabilities sorted by capability id, `source 'role'`, `inverted` copied from the capability
   - additional capabilities sorted by id, `source 'additional'`, `inverted` copied
   - denied capabilities sorted by id, `source 'denied'`, `inverted: true`

   Rule columns are copied verbatim from the capability row, with placeholders left uninterpolated.

`findDrift` computes the expected rows in memory and compares them with the stored rows as **sequences** ordered by `inverted, position`, comparing only the origin columns (`source`, `role_id`, `capability_id`) and rule columns. Absolute `position` values are **not** compared: FK cascades legitimately leave gaps. It never writes.

**Rule for every writer** (put it in the users-api README and one sentence in the architecture skill):

- Deleting a role, capability or user needs nothing: FK cascades remove exactly the derived rows in the same statement, and an identical rule from another role keeps its own row.
- Any other change to `user_roles`, `role_capabilities`, `user_additional_capabilities`, `user_denied_capabilities` or a capability's content calls `UserPermissionsProjector.rebuild` for the affected users **in the same transaction**.
- No such command exists today. Role rename changes no rule.

### 4.4 Commands

- `src/persistence/rebuild-user-permissions.ts` with script `"permissions:rebuild": "tsx src/persistence/rebuild-user-permissions.ts"`: rebuild every user of every tenant, one transaction per batch.
- `src/persistence/verify-user-permissions.ts` with script `"permissions:verify": "tsx src/persistence/verify-user-permissions.ts"`: print the drifted user ids per tenant, and exit non-zero on any drift.

Model both on `src/persistence/migrate.ts`: same env loading, ORM initialization and tenant enumeration. Document them next to `db:migrate`. Add `permissions:rebuild` to any existing seed workflow, and run `permissions:verify` in the e2e setup after seeding.

### 4.5 Permission source reads the rules

Replace the user branch of `CaslPermissionSource.load` so authorization costs one parallel round-trip:

```ts
    const [user, rows] = await Promise.all([
      this.store.em.findOne(User, { id }),
      this.store.em.find(
        UserPermissionRule,
        { userId: id },
        { orderBy: [{ inverted: 'asc' }, { position: 'asc' }] },
      ),
    ]);
    if (!user) return null;
    return {
      principal: { id: user.id, principalType: 'user', department: user.department ?? null },
      rules: rows.map(capabilityFromRow),
    };
```

- Remove the `GetUserCapabilitiesQueryRepository`/`GetRolesCapabilitiesQueryRepository` constructor dependencies if nothing else in the source needs them. The repositories stay; the overview and projector use them.
- Confirm that a concurrent `findOne` + `find` on one forked `EntityManager` is supported by the installed MikroORM and overlaps on PostgreSQL (pool, no transaction). If not, run them sequentially and record why.

### 4.6 Tests

- **Equivalence (the contract).** For fixtures covering:
  - roles with grants, inverted rules, fields and placeholder conditions
  - additional grants and denied entries
  - two roles granting an identical rule

  the Phase 3 source-table computation and the Phase 4 materialized read, after `buildAbility`, have identical multisets of direct and inverted rules, all direct rules first, and identical `can` results on a probe matrix of actions × subjects × fields × matching/non-matching subjects. Keep the Phase 3 computation only inside this test's fixture builder (or reuse the projector's in-memory expectation used by `findDrift`), not in production.
- **Projector:**
  - origin columns and ordering
  - `denied` rows always inverted
  - a same-transaction source change is visible
  - no rows for users without assignments
  - idempotent
  - `findDrift` detects a hand-edited row and a missing row
- **Cascades** (SQLite in the suite; PostgreSQL in e2e when available): role deletion removes exactly its rows while an identical rule from another role survives; capability and user deletion.
- **Integration** (`ddd/users-api/test/`):
  - rebuild removes a rule → the next dispatch is denied without a new login
  - DeleteRole → the holder's next dispatch lacks the role's rules
  - the role-definition query is not executed per request
- **Upgrade from an existing database (not only a fresh seed):** create a database at the pre-PR-2 schema, insert roles, capabilities and assignments (including two roles sharing a rule, an additional grant and a denial), run the new migration, then assert `findDrift` reports nothing and a dispatch for a pre-existing user is authorized exactly as before the upgrade.
- **Rename:** renaming a role changes no stored row and `findDrift` stays empty.
- **Cascade gaps:** after deleting one of two roles, `findDrift` stays empty although positions have gaps.
- **Commands:** `permissions:verify` exits 0 after `permissions:rebuild` and non-zero after a hand edit; `db:migrate` then `db:revert` succeeds on SQLite.

Verify with the PR 1 command list, then Phase 6.

Commit: `feat(users-api): materialize per-user permission rules and read them in one round-trip`.

## Phase 5 — access and refresh tokens (PR 3)

### 5.1 Current state (verify before editing)

- `CreateAuthCommand` (login) issues a one-hour HS256 JWT and persists an `Auth` aggregate storing the **raw JWT** in `auth.token`.
- `JwtAuthenticator` looks that row up on every request (`FindAuthQuery`) to detect logout.
- `DeleteAuthCommand` (logout) deletes it.
- On Fastify, `SessionService` stores the token in the encrypted session cookie.
- Neither adapter configures `trust proxy`.
- Express has no cookie parser.

### 5.2 Target contract

| Item | Contract |
| --- | --- |
| Access token | HS256 JWT, lifetime `ACCESS_TOKEN_TTL_SECONDS` (default 300, range 60–3600). Claims: `sub`, `sid`, `tenant`, `principalType: 'user'`, `iat`, `exp`, `jti`, plus issuer/audience as today. **No permission or department claims unless 5.9 is enabled.** Stateless: no per-request session lookup. |
| Refresh token | `randomBytes(32).toString('base64url')`. Only its SHA-256 hex hash is stored. Session lifetime `REFRESH_TOKEN_TTL_SECONDS` (default 1 209 600, minimum 3600), fixed at login and not extended by rotation. |
| Refresh transport | Only as a cookie: `HttpOnly; Secure; SameSite=Strict; Path=/auths` on both adapters. Named `refresh_token`. Never in a response body; never readable by JavaScript. |
| Session | The `Auth` aggregate becomes the session (one row per login). |
| Rotation | Every refresh that returns `'rotated'` gives a new access token in the body and sets a new refresh cookie; the presented token becomes "previous" and is recorded in the history table. |
| Grace window | Presenting the **immediately previous** token within `REFRESH_REUSE_GRACE_SECONDS` (default 30, range 0–120) after its rotation → 200 with a new access token for the same session, **no rotation and no `Set-Cookie`**. A concurrent second tab therefore succeeds without a retry; the cookie set by the winning response stays in the shared cookie jar. |
| Reuse detection | Every rotated-away hash is recorded until its session ends. Presenting **any** earlier token of a session (the previous one after the grace window, or any older generation) revokes the session, 401 `refresh_reused`. An unknown token → 401 `refresh_invalid`. |
| Client coordination | Browser clients perform refresh single-flight (one in-flight refresh shared by all callers; across tabs via the Web Locks API or equivalent). The grace window is a safety net for uncoordinated clients, not the coordination mechanism. Document this in the README with a short client snippet. |
| Rate limit | `RateLimitBehavior` on refresh, keyed on tenant + client IP (never the token). |
| Logout | Revokes the session and clears the cookie. An issued access token remains valid until its `exp`. |
| User deletion | FK cascade deletes the sessions. Permission-wise, the permission source already returns `null` on the next request. |

### 5.3 Configuration

New `src/common/environment/auth-token.config.ts`:

- It exports `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS` and `REFRESH_REUSE_GRACE_SECONDS`, parsed and range-checked at module load; invalid values throw at boot.
- Also `TRUST_PROXY`: unset → off; otherwise the value passed to Express `app.set('trust proxy', …)` / Fastify `trustProxy`. Wire it in `bootstrap.ts` so `req.ip` is the client, not the load balancer. Without it, every client behind a cloud load balancer shares one rate-limit bucket.

Document the names in the users-api README. Remove the hard-coded `+ 3600` in the issuer.

### 5.4 Persistence

New migration (the old sessions cannot be converted, because raw tokens cannot be hashed back):

```sql
delete from auth;
-- then bring `auth` to:
--   id varchar(64) pk, created_at bigint, updated_at bigint,
--   user_id varchar(64) not null references users(id) on delete cascade,
--   refresh_token_hash varchar(64) not null unique,
--   previous_refresh_token_hash varchar(64) null (indexed),
--   rotated_at bigint null, expires_at bigint not null, revoked_at bigint null,
--   version integer not null default 1

create table auth_consumed_refresh_tokens (
  token_hash varchar(64) not null primary key,
  auth_id varchar(64) not null references auth(id) on delete cascade,
  consumed_at bigint not null
);
create index auth_consumed_refresh_tokens_auth_id_index on auth_consumed_refresh_tokens (auth_id);
```

The history table grows by one row per refresh and disappears with its session (cascade). Add `src/persistence/purge-sessions.ts` with script `"sessions:purge"` that deletes sessions whose `expires_at` has passed or whose `revoked_at` is older than `REFRESH_TOKEN_TTL_SECONDS`, per tenant, in batches; document running it on a schedule.

- Use `alter table` on PostgreSQL. On SQLite, rebuild the table (create new, drop old, rename) if the column/constraint changes are unsupported.
- Implement `down()`. Update `auth.schema.ts`, with `version` declared the way other versioned aggregates declare it, so saves go through `optimisticUpdate()`. Extend the migration spec.

### 5.5 Domain

`auths/domain/models/auth.entity.ts`, domain methods only:

```ts
static start(userId: string, refreshTokenHash: string, expiresAt: number): Auth;

/**
 * Evaluates a presented refresh-token hash against this session.
 * Returns 'rotated' after moving to `nextHash`, or 'grace' when the immediately
 * previous token is presented within `graceMs` (state unchanged).
 */
refresh(presentedHash: string, nextHash: string, now: number, graceMs: number): 'rotated' | 'grace';
//  revoked or now >= expiresAt                         → InvalidRefreshTokenError
//  presented === current                               → previous = current; current = nextHash; rotatedAt = now; 'rotated'
//  presented === previous && now - rotatedAt <= grace  → 'grace'
//  presented === previous                              → revoke(now); RefreshTokenReuseError
//  otherwise                                           → InvalidRefreshTokenError

revoke(now: number): void;
```

- Put `InvalidRefreshTokenError` and `RefreshTokenReuseError` in `auths/domain/errors/`. Map both to HTTP 401 at the presentation boundary, following `DomainExceptionFilter`, with a machine-readable code (`refresh_invalid`, `refresh_reused`).
- For `RefreshTokenReuseError`, the handler catches it only to save the revoked aggregate, then rethrows it.

### 5.6 Application

- **Login (`CreateAuthHandler`):**
  - after credential verification, generate the refresh token and call `Auth.start(userId, sha256(token), now + REFRESH_TTL)`, then save
  - issue the access token with `sid = auth.id`
  - the result carries the raw refresh token only for the controller to set the cookie
  - keep its rate limit (by email), audit and metrics behaviors
- **New `RefreshAuthCommand { refreshToken, clientIp }` + `RefreshAuthHandler`:**
  - no CASL requirement (the refresh token is the credential)
  - rate limit via `createPartitionedRateLimitKeyFactory((ctx) => (ctx.request as RefreshAuthCommand).clientIp)`
  - audit/metrics like login; never log the token or its hash
  - flow (h = sha256 of the cookie value):
    1. load the session by `refresh_token_hash = h OR previous_refresh_token_hash = h` through a write-side repository port
    2. none found → look `h` up in `auth_consumed_refresh_tokens`:
       - found → load that session, `revoke(now)`, versioned save, throw `RefreshTokenReuseError`
       - not found → `InvalidRefreshTokenError`
    3. `result = session.refresh(h, sha256(next), now, graceMs)`
    4. `'grace'` → issue an access token for the session; **no** save, **no** cookie
    5. `'rotated'` → insert `{ token_hash: h, auth_id, consumed_at: now }` into `auth_consumed_refresh_tokens` (autocommit), then the versioned save of the session (rule 13 forbids an outer transaction around `optimisticUpdate()`). The session lookup in step 1 runs before the history lookup, so a history row whose rotation save then failed can never revoke a live session.
    6. on `ConcurrencyConflictError` from the save: reload the session once and re-evaluate from step 3. The concurrent winner has made `h` the previous token, so this resolves to `'grace'` inside the window. Never map the conflict itself to an error response.
    7. issue a new access token; the controller sets the new cookie only for `'rotated'`
- **Logout (`DeleteAuthCommand`):** takes the refresh token from the cookie, loads the session by hash, `revoke(now)`, versioned save. Unknown or missing → no-op.
- **`JwtAuthenticator`:**
  - remove the per-request `FindAuthQuery` lookup
  - verify signature, `exp`, issuer and audience
  - map `sub`, `principalType`, `tenant` and `sid` to the session user
  - remove `FindAuthQuery`, its repository and its registrations if nothing else uses them
- **Fastify `SessionService`:** stores only the access token and `{ id, principalType, tenant, exp }`.

### 5.7 Presentation

- **`AuthsController`:**
  - `POST /auths/login` → body `{ accessToken, accessTokenExpiresAt, … }` plus the `Set-Cookie: refresh_token=…` header
  - new `POST /auths/refresh` (no body) → the same shape, reading the cookie and passing `req.ip` as `clientIp`
  - `POST /auths/logout` → reads the cookie, clears it, 204
  - tenant resolution for refresh follows login
- **Cookies:**
  - Fastify: use the cookie support already registered with secure-session.
  - Express: if no cookie parsing exists, add `cookie-parser` to `ddd/users-api` only.
  - Set and clear the cookie in one small presentation helper shared by both adapters.
- **CSRF:** `SameSite=Strict` plus a body-less refresh that returns tokens only in the response body (unreadable cross-site) is the protection. State this in the README.

### 5.8 Tests

- **Domain:** every `rotate` branch, including a grace boundary exactly at `graceMs`; `revoke`.
- **Handlers:**
  - login stores only a hash (assert the raw token never reaches the repository or the logs)
  - deterministic sequence with a controllable clock: A → rotated (B); A again inside grace → 200, no cookie, session still at B; B → rotated (C); A after grace → `refresh_reused` and the session is revoked; C then fails
  - **older-generation reuse:** after A → B → C, presenting A (only in the history table) revokes the session
  - forced `ConcurrencyConflictError` on the rotation save (stubbed repository, not a real race) → reload → `'grace'` → 200 without cookie
  - a history row whose session save failed does not revoke the still-current session
  - `sessions:purge` removes expired sessions and their history
  - an expired session → 401
  - logout revokes; an unknown cookie → 204
  - the rate-limit key uses the client IP
- **Authenticator:** no repository call per request; expired → 401; no permission claims are read.
- **HTTP e2e** (Express and Fastify):
  - login → API call → refresh → API call → logout → refresh fails
  - two refreshes with the same cookie, with the **order of responses controlled** (the first request's rotation committed before the second is evaluated, and the reverse): both receive 200, exactly one response carries `Set-Cookie`, and a subsequent refresh with the jar's cookie succeeds
  - cookie attributes (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/auths`)
  - `req.ip` honors `TRUST_PROXY`
- **Config parsing and migration up/down** on SQLite.

### 5.9 Optional: permissions carried in the access token

An opt-in mode in which an authenticated user request performs **no database read for authorization**. Off by default. Permissions still originate from `user_permission_rules`; the token is only a signed, short-lived copy.

#### Configuration

Add to `src/common/environment/auth-token.config.ts`:

- `PERMISSIONS_IN_ACCESS_TOKEN`: `'true' | 'false'`, default `false`; any other value throws at boot.
- `ACCESS_TOKEN_MAX_BYTES`: integer 1024–16384, default **2700**. On Fastify the token is stored inside the secure-session cookie: session JSON → encrypted (nonce + MAC) → Base64, roughly `(token + ~240) × 4/3` plus cookie name and attributes. 2700 keeps the final `Set-Cookie` under 4096 bytes. The real budget is the **serialized cookie**, not the JWS; the boundary test below is the authority.

#### Read port

- New application port `auths/application/ports/user-permission-rules.port.ts`:
  - `USER_PERMISSION_RULES` token
  - `interface IUserPermissionRules { findOrdered(userId: string): Promise<Capability[]> }`
- Persistence implementation `auths/persistence/user-permission-rules.reader.ts`: `em.find(UserPermissionRule, { userId }, { orderBy: [{ inverted: 'asc' }, { position: 'asc' }] })` mapped with `capabilityFromRow`.
- `CaslPermissionSource` (4.5) switches to this port for its rule read and keeps the parallel user read. One implementation of the ordered read.

#### Issuing (login and refresh)

When `PERMISSIONS_IN_ACCESS_TOKEN` is `true`, the access-token issuer receives the fresh user and `findOrdered(user.id)`, and adds two claims:

```json
{ "department": "engineering",
  "perms": ["User|read|*", "User|update|{\"department\":\"${user.department}\"}|username", "!User|read|*|email", "!User|delete|*"] }
```

- `perms` holds `serializeCapability` strings in the port's order (all direct rules, then all inverted).
- Every principal attribute a placeholder can reference goes into the token. Today that is `department`; placeholders using `id` resolve from `sub`.
- **Size fallback:** after signing, if the compact JWS is longer than `ACCESS_TOKEN_MAX_BYTES`, re-issue it **without** `perms` and `department`. Log a warning with the user id and rule count (never the token or the rules). That user's requests then use the database path. Nothing fails because a user has many rules.
- Login and refresh handlers depend on the port through its token, never on the ORM.

#### Consuming

- **`JwtAuthenticator`:**
  - when the flag is `true` **and** the verified token has `perms`: parse each entry with `parseCapabilityString` (any malformed entry → 401) and set `grants: Capability[]` and `department` on the session user
  - when the flag is `false`, ignore `perms`/`department` even if present, so switching the flag off takes effect at once for tokens already issued
- **`CaslPermissionSource.load`, user branch:** if the session user carries `grants`, return `{ principal: { id, principalType: 'user', department: session.department ?? null }, rules: session.grants }` **without any query**. Otherwise use the database path (4.5). Only authenticators populate the session user; never read `grants` from request payloads.
- The service branch is unchanged.

#### Behavior to document (users-api README "Authentication")

| | Database path (default) | Token path |
| --- | --- | --- |
| DB reads per request for authorization | 1 parallel round-trip | 0 |
| Permission change, user deletion, department change | next request | next refresh (≤ `ACCESS_TOKEN_TTL_SECONDS`) |
| Rule visibility | server only | readable by the client (JWS is signed, not encrypted) |
| Token size | small | larger; above `ACCESS_TOKEN_MAX_BYTES` (budgeted on the final Fastify cookie) falls back to the database path per user |

#### Tests

- **Config:** valid, invalid and default values for both variables.
- **Issuer:**
  - flag off → no `perms`/`department`
  - flag on → claims in port order
  - an oversize token → re-issued without them, with the warning logged (no token or rule text in the log)
  - **Fastify cookie boundary (HTTP e2e):** log in a user whose token with `perms` is exactly `ACCESS_TOKEN_MAX_BYTES`; assert every `Set-Cookie` header value is ≤ 4096 bytes and the next request authenticates from that cookie. One byte over the limit must produce a token without `perms`. If the assertion fails, lower the default; never raise the cookie limit
- **Authenticator:**
  - flag on with valid `perms` → `grants` + `department` on the session user
  - a malformed entry → 401
  - flag off with a token that has `perms` → ignored
- **Permission source:**
  - with `grants` → zero ORM calls (spy on the EntityManager) and the rules returned in order
  - without → the database path
- **Equivalence:** for the Phase 4 fixtures, the ability built from token `perms` equals the ability built from the database path (same rules, same `can` matrix).
- **HTTP e2e with the flag on:**
  - login → API call issues no permission queries
  - a rule change + rebuild is not visible until refresh, and is visible after it
  - an oversize user works through the fallback

Verify with the PR 1 command list, then Phase 6.

Commit: `feat(auth)!: short-lived access tokens with rotating hashed refresh tokens`.

## Phase 6 — documentation, context and verification (end of every PR)

- **Package README** (Phase 2) matches the code.
- **users-api README** sections, current state only:
  - "Authorization" (two-stage checks, read models, write responses, overview composition)
  - "Permission source" (tables, ordering contract, cascades, writer rule, `permissions:rebuild`/`permissions:verify`) — PR 2 onwards
  - "Authentication" (tokens, cookie, rotation, grace, reuse, logout semantics, `TRUST_PROXY`, the `PERMISSIONS_IN_ACCESS_TOKEN` trade-off table) — PR 3
  - service `API_CLIENTS` rules format
  - environment variable names
- **Architecture skill:**
  - show `authorizer.authorize(...)` (void check) for writes, `project` for responses and `requires(...)` for pipeline declarations
  - add the one-sentence materialization rule (PR 2) and token rule (PR 3)
  - keep the rule text otherwise
- **Context map:** `pnpm context:update`; hand-edit the Critical Modules, Conventions, Security and Gotchas sections that name the old CASL APIs, resolver or tokens; `pnpm context:validate`.
- **Review record:** append an "Implementation outcome" section per PR to the end of this plan file (commit SHAs, what changed, commands with results, remaining limits).
- **Task file:** update `.claude/tasks/casl-v2.md`. After PR 3, move durable content to the READMEs/review doc and delete the task file.
- **Final report per PR:**
  - changed/deleted files
  - commands with results
  - breaking changes (package API; `API_CLIENTS` format; token claims; login/refresh/logout contract; sessions invalidated by the PR 3 migration)
  - client-visible behavior (fewer fields on write responses; `{}` for write-only callers; fresh reads under conditional rules)
  - remaining limits:
    - no transaction spans a check and a later write
    - a logged-out access token lives until `exp`
    - writers that skip `rebuild` drift until `permissions:verify` catches them
    - authorized pagination is separate work

## Out of scope

- Keeping any API of the parked package; building, testing or publishing `packages/_old/`.
- A permission cache (in-memory, Redis or `MikroOrmCache`), TTLs on permissions, encrypted tokens (JWE) for the token path.
- Assignment/revocation commands and admin UI. The projector and the writer rule make them straightforward later.
- A disabled-user flag (`users.disabled_at`), token deny-lists, sender-constrained tokens (DPoP/mTLS).
- Strict CASL-leaf projection, `AppAbility` widening, policy registries, DSLs, entity-loading decorators, global response scrubbing.
- Changes to `@nestjs-pipeline/core`, `@nestjs-pipeline/idempotency` or `@nestjs-pipeline/cache`.
- Request-payload authorization before the handler (the old `subjectFromRequest`/`fieldsFromRequest`). If an external consumer needs it later, add it as a **separate opt-in behavior** (e.g. `CaslRequestAuthorizationBehavior`), never as options on `CaslBehavior`.
- A `prebuiltAbility` option on `CaslBehavior`: tests construct `CaslAuthorizer(ability)` or stub `ICaslPermissionSource`; a test-only option would violate `AGENTS.md` rule 20.
- A CASL-to-MikroORM query translator. If needed later, it is a separate adapter package consuming `ability.rulesFor(...)`.
