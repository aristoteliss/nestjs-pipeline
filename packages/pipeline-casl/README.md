# @nestjs-pipeline/casl

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/casl.svg)](https://www.npmjs.com/package/@nestjs-pipeline/casl)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/casl.svg)](https://www.npmjs.com/package/@nestjs-pipeline/casl)

CASL authorization for `@nestjs-pipeline/core`, in two stages:

1. **`CaslBehavior`** checks type-level requirements (`read User`) before the handler,
   and before any cache or idempotency behavior can short-circuit it.
2. **`CaslAuthorizer`** checks the loaded entity and its fields inside the handler, and
   projects responses to the fields the caller may read.

Your application supplies one port, `ICaslPermissionSource`, that returns the caller and
their rules for each pipeline execution. Where the rules come from (database, token,
configuration) is the application's decision.

## Installation

```bash
pnpm add @nestjs-pipeline/casl @nestjs-pipeline/core @casl/ability @nestjs/common @nestjs/core reflect-metadata
```

Peers: `@casl/ability` `^7.0.0`, `@nestjs/common` `^12.1.0`, `@nestjs/core` `^12.1.0`,
`@nestjs-pipeline/core` `^0.3.0`, `reflect-metadata`. Node.js 22.12 or later.

## Register the module

```ts
import { Injectable, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import {
  type CaslAuthorizationInput,
  CaslModule,
  type ICaslPermissionSource,
} from '@nestjs-pipeline/casl';
import { PipelineModule } from '@nestjs-pipeline/core';

@Injectable()
export class AppPermissionSource implements ICaslPermissionSource {
  constructor(private readonly grants: GrantRepository) {}

  async load(): Promise<CaslAuthorizationInput | null> {
    const session = currentSession();
    if (!session) return null; // unauthenticated: every gated handler is denied
    return {
      principal: { id: session.userId, department: session.department },
      rules: await this.grants.rulesFor(session.userId),
    };
  }
}

@Module({
  providers: [AppPermissionSource, GrantRepository],
  exports: [AppPermissionSource],
})
export class AuthorizationModule {}

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({}),
    CaslModule.forRoot({
      imports: [AuthorizationModule],
      permissionSource: { useExisting: AppPermissionSource },
    }),
  ],
})
export class AppModule {}
```

`CaslModule.forRoot` is global: it provides and exports `CaslBehavior`, `CaslAuthorizer`
and `CASL_PERMISSION_SOURCE`. `global: true` only makes those exports visible; the source
still resolves its own dependencies, which is what `imports` is for. The recommended form
is the one above: an application module that provides and exports the source, passed
through `imports` and referenced with `useExisting`. `permissionSource` also accepts a
class, `{ useClass }` and `{ useFactory, inject }`.

A request-scoped source makes `CaslBehavior` request-scoped as well, which is how a
source reads per-request state.

`load()` receives the pipeline context, so a source can also read the caller from the
request itself. A source built with a factory:

```ts
CaslModule.forRoot({
  imports: [AuthorizationModule],
  permissionSource: {
    useFactory: (grants: GrantRepository): ICaslPermissionSource => ({
      async load(context) {
        const session = (context.request as { sessionUser?: SessionUser }).sessionUser;
        if (!session) return null;
        return {
          principal: { id: session.id, tenantId: session.tenantId },
          rules: await grants.rulesFor(session.id),
        };
      },
    }),
    inject: [GrantRepository],
  },
});
```

Rules may mix `Capability` objects and strings, and roles are simply rules the source
concatenates; deny rules win regardless of order (see [Rule precedence](#rule-precedence)):

```ts
const roles: Record<string, string[]> = {
  admin: ['all|manage|*'],
  author: ['Post|read|*', 'Post|create|*', 'Post|update|{"authorId":"${user.id}"}'],
};

async rulesFor(userId: string): Promise<Capability[]> {
  const { roleNames, extra, denied } = await this.store.grantsOf(userId);
  return [...roleNames.flatMap((name) => roles[name] ?? []), ...extra, ...denied]
    .map(normalizeCapability);
}
```

## Declare requirements

```ts
@QueryHandler(GetUserQuery)
@UsePipeline(requires({ action: 'read', subject: 'User' }))
export class GetUserHandler {}

@CommandHandler(UpdatePostCommand)
@UsePipeline(
  requires(
    { action: 'update', subject: 'Post', field: 'title' },
    { action: 'update', subject: 'Post', field: 'body' },
  ),
)
export class UpdatePostHandler {}
```

`requires(a, b, …)` returns `[CaslBehavior, { rules }]`; every requirement must pass (AND).
The behavior stores the built ability and principal in `context.items`
(`CASL_ABILITY_KEY`, `CASL_PRINCIPAL_KEY`); read them with `getCaslAbility()` and
`getCaslPrincipal()`. A handler without requirements runs without loading permissions.

## Check entities in the handler

`CaslAuthorizer` has four methods. It uses the ability `CaslBehavior` stored for the
current execution, or one passed to its constructor (`new CaslAuthorizer(ability)`). No
ability means deny.

```ts
// Writes: throw unless the entity and every accepted field are permitted.
const user = await this.users.findById(command.id);
if (!user) throw new EntityNotFoundException('User', command.id);
this.authorizer.authorize('update', user, ['username', 'email']);
user.update(command.changes);

// Responses: authorize the entity, then return only readable candidate fields.
return this.authorizer.project('read', user, {
  id: user.id,
  username: user.username,
  email: user.email,
});

// Optional sections: a boolean check.
if (this.authorizer.can('read', user, 'email')) { /* … */ }

// Freshness: a conditional rule decides on entity attributes, so read the entity
// fresh rather than from a cache. True as well when no ability is present.
const refresh = this.authorizer.dependsOnEntity('read', 'User');
```

A full handler, with tenant-scoped conditions evaluated against the loaded entity:

```ts
// Rule from the source: 'Project|update|{"tenantId":"${user.tenantId}"}|name,status'
@CommandHandler(UpdateProjectCommand)
@UsePipeline(requires({ action: 'update', subject: 'Project' }))
export class UpdateProjectHandler implements ICommandHandler<UpdateProjectCommand> {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(command: UpdateProjectCommand) {
    const project = await this.projects.findById(command.id);
    // Throws UnauthorizedActionException for a project of another tenant,
    // or when the command changes a field other than name or status.
    this.authorizer.authorize('update', project, command.changedFields);
    project.rename(command.name);
    await this.projects.save(project);
    return this.authorizer.project('read', project, project.toJSON());
  }
}
```

The subject type is the entity's class name (`Project`). For a plain object, tag it with
CASL's `subject()`: `this.authorizer.can('read', subject('Project', row))`.

`authorize` returns `void`. `project` returns `Projected<T>`: every property may be
absent, and array items may be `null`.

## Capability format

Rules are `Capability` objects or compact strings:

```ts
{ subject: 'User', action: 'update',
  conditions: { department: '${user.department}' }, fields: ['username'] }

'User|update|{"department":"${user.department}"}|username'
'!User|delete|*'     // inverted (deny)
'all|manage|*'       // every action on every subject
'User|read|*|id,username|reason text'
```

- String form: `[!]subject|action[|conditions[|fields[|reason]]]`. `*` means no
  conditions or all fields. Segments containing a delimiter are written as `~` +
  base64url JSON, so every capability round-trips through `serializeCapability` and
  `parseCapabilityString`; malformed strings throw.
- `all` matches any subject and `manage` any action (CASL keywords).
- Placeholders `${user.<path>}` (or `${<path>}`, `{{ <path> }}`) resolve against the
  principal. A whole-string placeholder keeps the value's type. A missing attribute
  throws instead of matching an empty value, and so does an attribute that is not a
  string, number, boolean, `null` or an array of those: an object would otherwise
  be evaluated as query operators.
- An allow rule with `fields: []` throws: omit `fields` for all fields.

## Rule precedence

`buildAbility(rules, principal)` places every direct rule before every inverted rule,
stable within each group. A deny therefore wins over an allow regardless of which
source contributed either, e.g. `all|manage|*` from one role and `!User|delete|*` from a
user denial deny `delete User` in either input order.

## Projection

- A granted parent path authorizes its descendants unless one is explicitly denied:
  `fields: ['profile']` lets `project` return `profile.secret`, while
  `can('read', user, 'profile.secret')` is `false` (CASL needs `profile.*`/`profile.**`).
  `can`/`authorize` and `project` therefore apply different field policies to the same
  grant. Grant nested access as `profile.**` when a handler checks nested fields and
  projects the same response, so both agree:

  ```ts
  // fields: ['profile']    → project returns profile.secret; can(…, 'profile.secret') is false
  // fields: ['profile.**'] → project returns profile.secret; can(…, 'profile') and
  //                          can(…, 'profile.secret') are both true
  ```
- A denied array element becomes `null`, so positions stay stable (`roles.0`).
- Root arrays retain their array shape. Named fields apply to every item; numeric
  paths restrict specific items (`0`, `0.id`). Nested arrays use the same masking
  and cycle detection as nested object properties. One supplied subject governs
  the whole candidate; authorize collections of distinct entities item by item.
- Conditions are evaluated against the **subject**, never the candidate, so a response
  DTO cannot satisfy a condition the entity does not.
- Cyclic input and more than 1024 array path aliases throw.

## Short-circuit behaviors

A pipeline cache or idempotency hit skips the handler, and with it the handler's entity
and field checks. `CaslBehavior` still runs first, but a type-level check does not
reproduce them.

- **Response caches** key on tenant + principal (`getCaslPrincipal()`) + a digest of the
  effective rules (`abilityDigest(context)`), and bypass the cache when entity
  conditions can change the result (`hasEntityConditions(ability, subjects, action)`).
- **Idempotency** keeps a **stable operation key** (tenant + principal + operation, no
  permission data, so a permission change cannot run the effect twice) and binds replay
  with a **separate** fail-closed authorization digest compared before any stored
  response is returned (`replayScopeFactory: requireAbilityDigest`). A missing or mismatched digest refuses the replay.

`abilityDigest(context?)` is the SHA-256 of the ability's rules in order, with conditions
already resolved against the principal: a changed rule, order, field list, inversion or
interpolated principal value changes it. It identifies permissions, not a caller, so
combine it with the principal in any key that must separate callers. It is `undefined`
when no ability is present; `requireAbilityDigest(context?)` throws `MissingAbilityError`
instead, a configuration error to map to a server error, never to 403.

## Lists

```ts
const visible = posts
  .filter((post) => this.authorizer.can('read', post))
  .map((post) => this.authorizer.project('read', post, post.toJSON()));
```

Authorizing a list (`can` + `project` per item) filters an already loaded collection in
memory. It is not database filtering: pagination counts and page sizes still reflect
unauthorized rows. Authorized pagination needs a query-side design.

## Errors

- Every denial is an `UnauthorizedActionException` (`action`, `subject`, optional
  `entityId` and `fields`). The package throws no transport exceptions. Over HTTP,
  register the bundled `UnauthorizedActionFilter`. Nest injects its `HttpAdapterHost`, and
  the filter replies through that adapter (Express and Fastify, also for an error thrown
  in middleware):

  ```typescript
  @Module({
    providers: [{ provide: APP_FILTER, useClass: UnauthorizedActionFilter }],
  })
  export class AppModule {}
  ```

  In `main.ts`, pass the host:
  `app.useGlobalFilters(new UnauthorizedActionFilter(app.get(HttpAdapterHost)))`.

  It answers `403 Forbidden` with `statusCode`, `error`, `message`, `action` and
  `subject`. The message can include the entity id and denied fields.
- An unauthenticated caller (`load` returned `null`) is denied with reason
  `Access denied — authentication required.`
- Permission source failures, malformed rules and unresolved placeholders propagate as
  their own errors, never as denials.

## API

| Export | Kind |
| --- | --- |
| `CaslModule`, `CaslModuleOptions` | Module registration |
| `CaslBehavior`, `CaslBehaviorOptions`, `CASL_BEHAVIOR_ID` | Type-level behavior |
| `requires` | `@UsePipeline` declaration helper |
| `CaslAuthorizer` | `can`, `authorize`, `project`, `dependsOnEntity` |
| `getCaslAbility`, `getCaslPrincipal`, `hasEntityConditions`, `abilityDigest`, `requireAbilityDigest` | Execution context and cache policy helpers |
| `ICaslPermissionSource`, `CaslPrincipal`, `CaslAuthorizationInput`, `CASL_PERMISSION_SOURCE` | Application port |
| `buildAbility`, `interpolateConditions` | Ability construction |
| `parseCapabilityString`, `serializeCapability`, `normalizeCapability` | Capability codec |
| `Capability`, `CapabilityString`, `AbilityRequirement`, `AppAbility`, `AppRawRule`, `Projected` | Types |
| `CASL_ABILITY_KEY`, `CASL_PRINCIPAL_KEY`, `CASL_ACTIONS`, `CASL_SUBJECTS`, `CaslAction`, `CaslSubject` | Constants |
| `UnauthorizedActionException`, `UnauthorizedActionDetails` | Denial error |
| `MissingAbilityError` | No ability where one is required (configuration error) |
| `UnauthorizedActionFilter` | Exception filter: denial → HTTP 403 |

## Migrating from 0.1.x

These steps lead to 0.2.0. To reach 0.3.0, continue with [Upgrading from 0.2.x](https://github.com/aristoteliss/nestjs-pipeline#upgrading-from-02x) in the repository README.

**1. Peers and runtime.** `@casl/ability` `^7.0.0` (was `^6.0.0`), `@nestjs/common`
`^11.0.0` (was `^10 || ^11`), `@nestjs-pipeline/core` `^0.2.0`, Node.js 22 or later.

```bash
pnpm add @casl/ability@^7 @nestjs/common@^11 @nestjs-pipeline/core@^0.2.0 @nestjs-pipeline/casl@^0.2.0
```

**2. One permission source replaces the providers and resolvers.** The module options
`roleProvider`, `userCapabilityProvider`, `userContextResolver`, `subjectContextPaths`
and `defaultFieldsFromRequest` are removed, with `IRoleProvider`,
`IUserCapabilityProvider`, `IUserContextResolver`, `StaticRoleProvider`,
`RoleDefinition`, `UserCapabilities` and `CaslUserContext`. Their work moves into one
`ICaslPermissionSource.load()`, which returns the principal and the already expanded
rules (role rules, per-user additions and denials in one list).

```ts
// 0.1.x
CaslModule.forRoot({
  roleProvider: { useFactory: (pool: Pool) => new PgRoleProvider(pool), inject: [Pool] },
  userCapabilityProvider: PgUserCapabilityProvider,
  userContextResolver: JwtUserContextResolver,
  subjectContextPaths: ['sessionUser'],
  defaultFieldsFromRequest: { User: ['username', 'email'] },
});

// 0.2.0
@Injectable()
export class PgPermissionSource implements ICaslPermissionSource {
  constructor(private readonly roles: PgRoleProvider, private readonly users: PgUserCapabilityProvider) {}

  async load(context: IPipelineContext): Promise<CaslAuthorizationInput | null> {
    const user = (context.request as { sessionUser?: { id: string; tenantId: string } }).sessionUser;
    if (!user) return null;
    const grants = await this.users.getUserCapabilities(user);
    const roleRules = (await this.roles.getRoles(grants.roles)).flatMap((r) => r.capabilities);
    return {
      principal: user,
      rules: [...roleRules, ...grants.additionalCapabilities, ...grants.deniedCapabilities]
        .map(normalizeCapability),
    };
  }
}

CaslModule.forRoot({
  imports: [DatabaseModule],
  permissionSource: PgPermissionSource,
});
```

`PgRoleProvider` and `PgUserCapabilityProvider` above are your former implementations,
now plain application services.

**3. Principal instead of `CASL_USER_CONTEXT_KEY`.** Setting the user in
`context.items` is no longer read; return it as `principal` from `load()`. `principal.id`
is required. Placeholders resolve against it (`${user.tenantId}`, `${tenantId}` and
`{{ tenantId }}` are equivalent).

```ts
// 0.1.x
context.items.set(CASL_USER_CONTEXT_KEY, { id: user.id, tenantId: user.tenantId });

// 0.2.0 — in load()
return { principal: { id: user.id, tenantId: user.tenantId }, rules };
```

**4. `requires()` replaces the tuple (the tuple still works).**

```ts
// 0.1.x
@UsePipeline([CaslBehavior, { rules: [{ action: 'create', subject: 'Post' }] }])

// 0.2.0
@UsePipeline(requires({ action: 'create', subject: 'Post' }))
```

`rules` must be non-empty. The `prebuiltAbility` option is removed; to check against an
ability you built yourself, use `new CaslAuthorizer(ability)`.

**5. Entity and field checks move into the handler.** `subjectFromRequest`,
`fieldsFromRequest`, the per-handler `subjectContextPaths` and `defaultFieldsFromRequest`
are removed. 0.1.x evaluated conditions against the command payload; 0.2.0 evaluates them
against the entity the handler loads, with `CaslAuthorizer`.

```ts
// 0.1.x
@UsePipeline([CaslBehavior, {
  subjectFromRequest: 'User',
  fieldsFromRequest: ['username', 'department'],
  rules: [{ action: 'update', subject: 'User' }],
}])

// 0.2.0
@UsePipeline(requires({ action: 'update', subject: 'User' }))
export class UpdateUserHandler {
  constructor(private readonly users: UserRepository, private readonly authorizer: CaslAuthorizer) {}

  async execute(command: UpdateUserCommand) {
    const user = await this.users.findById(command.id);
    this.authorizer.authorize('update', user, ['username', 'department']);
    // …
  }
}
```

With `@nestjs-pipeline/zod`, `UpdateUserCommand.updatableFields` supplies the field list.

**6. `skipCheck` is removed.** To tailor a response without gating the handler, declare
the weakest requirement and read the ability:

```ts
// 0.1.x
@UsePipeline([CaslBehavior, { skipCheck: true }])
// … context.items.get(CASL_ABILITY_KEY)

// 0.2.0
@UsePipeline(requires({ action: 'read', subject: 'Post' }))
// … getCaslAbility()?.can('read', 'DraftPost'), or this.authorizer.can('read', 'DraftPost')
```

**7. Denials are `UnauthorizedActionException`, not `ForbiddenException`.** Register the
filter to keep HTTP 403 responses:

```ts
{ provide: APP_FILTER, useClass: UnauthorizedActionFilter }
```

Code that caught `ForbiddenException` must catch `UnauthorizedActionException`.

**8. `buildAbility` takes rules, not roles.** Its 0.1.x signature was
`buildAbility(roles, user, additional)`; it is now `buildAbility(rules, principal)`.
`buildAbilityFromRules`, `capabilityToRawRule`, `capabilitiesToRawRules` and
`CASL_BEHAVIOR_LOGGER` are removed.

```ts
// 0.1.x
const ability = buildAbility(roleDefinitions, user, extraCaps);
const same = buildAbilityFromRules(capabilitiesToRawRules(caps, user));

// 0.2.0
const ability = buildAbility(
  [...roleDefinitions.flatMap((role) => role.capabilities), ...extraCaps],
  principal,
);
```

**9. Stricter rules.** An unresolved placeholder, a placeholder resolving to an object,
and an allow rule with `fields: []` now throw. Direct rules are always applied before
inverted ones, so a deny wins whatever the input order.

## License

See [LICENSE](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [COMMERCIAL_LICENSE.txt](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt).
