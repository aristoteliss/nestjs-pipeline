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
pnpm add @nestjs-pipeline/casl @nestjs-pipeline/core @casl/ability @nestjs/common reflect-metadata
```

Peers: `@casl/ability` `^7.0.0`, `@nestjs/common` `^11`, `@nestjs-pipeline/core`,
`reflect-metadata`.

## Register the module

```ts
import {
  type CaslAuthorizationInput,
  CaslModule,
  type ICaslPermissionSource,
} from '@nestjs-pipeline/casl';

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

`CaslAuthorizer` has three methods. It uses the ability `CaslBehavior` stored for the
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
```

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
  throws instead of matching an empty value.
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
  effective rules (`getCaslAbility().rules`), and bypass the cache when entity
  conditions can change the result (`hasEntityConditions(ability, subjects, action)`).
- **Idempotency** keeps a **stable operation key** (tenant + principal + operation, no
  permission data, so a permission change cannot run the effect twice) and binds replay
  with a **separate** fail-closed authorization digest compared before any stored
  response is returned. A missing or mismatched digest refuses the replay.

## Lists

Authorizing a list (`can` + `project` per item) filters an already loaded collection in
memory. It is not database filtering: pagination counts and page sizes still reflect
unauthorized rows. Authorized pagination needs a query-side design.

## Errors

- Every denial is an `UnauthorizedActionException` (`action`, `subject`, optional
  `entityId` and `fields`). Map it to HTTP 403 in your presentation layer; the package
  throws no transport exceptions.
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
| `CaslAuthorizer` | `can`, `authorize`, `project` |
| `getCaslAbility`, `getCaslPrincipal`, `hasEntityConditions` | Execution context and cache policy helpers |
| `ICaslPermissionSource`, `CaslPrincipal`, `CaslAuthorizationInput`, `CASL_PERMISSION_SOURCE` | Application port |
| `buildAbility`, `interpolateConditions` | Ability construction |
| `parseCapabilityString`, `serializeCapability`, `normalizeCapability` | Capability codec |
| `Capability`, `CapabilityString`, `AbilityRequirement`, `AppAbility`, `AppRawRule`, `Projected` | Types |
| `CASL_ABILITY_KEY`, `CASL_PRINCIPAL_KEY`, `CASL_ACTIONS`, `CASL_SUBJECTS`, `CaslAction`, `CaslSubject` | Constants |
| `UnauthorizedActionException`, `UnauthorizedActionDetails` | Denial error |

## License

See [LICENSE](./LICENSE) and [COMMERCIAL_LICENSE.txt](./COMMERCIAL_LICENSE.txt).
