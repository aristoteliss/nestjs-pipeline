---
title: "Upgrading from 0.1.x"
sidebar:
  order: 3
---

0.2.0 breaks the API of the five packages that were on npm before:
`@nestjs-pipeline/core` 0.1.18, `/correlation`, `/opentelemetry`, `/zod` and `/casl`.
Every change is listed per package in [CHANGELOG.md](/nestjs-pipeline/changelog/); the ones below need a
code change in most applications.

**1. Node.js 22 and NestJS 11.** Every package declares `engines.node >=22`. Core requires
`@nestjs/common`, `@nestjs/core` and `@nestjs/cqrs` `^11.0.0`; `/correlation`,
`/opentelemetry`, `/zod` and `/casl` require `@nestjs/common` `^11.0.0`, and the last three
also require `@nestjs-pipeline/core` `^0.2.0` (it was `*`). Core now installs
`@cqrs-ddd/uuidv7`, `@cqrs-ddd/untyped` and `@cqrs-ddd/safe-stringify` as dependencies.

**2. Tenant and correlation id come from `sources`.** The module options
`correlationIdFactory` and `correlationIdRunner` are removed. Pass the stores of
`@nestjs-pipeline/correlation` (and, for multi-tenant applications, `@nestjs-pipeline/tenant`)
instead:

```typescript
// 0.1.x
import { getCorrelationId, runWithCorrelationId } from '@nestjs-pipeline/correlation';

PipelineModule.forRoot({
  correlationIdFactory: getCorrelationId,
  correlationIdRunner: runWithCorrelationId,
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
});

// 0.2.0
import { correlationSource } from '@nestjs-pipeline/correlation';
import { tenantSource } from '@nestjs-pipeline/tenant';

PipelineModule.forRoot({
  sources: { tenantId: tenantSource, correlationId: correlationSource },
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
});
```

Without `sources`, bootstrap logs a warning; `sources: {}` silences it when you use neither
package.

**3. `correlationStore` and `setCorrelationFallback` are gone.** Read and set the ID through
the functions, which keep their API (`HttpCorrelationMiddleware` and `addCorrelationId` do
change; see the [correlation migration notes](/nestjs-pipeline/packages/nestjs-pipeline/correlation/#migrating-from-01x)):

```typescript
// 0.1.x
import { correlationStore } from '@nestjs-pipeline/correlation';
correlationStore.run(job.id, () => this.commandBus.execute(command));
const id = correlationStore.getStore();

// 0.2.0
import { getCorrelationId, runWithCorrelationId } from '@nestjs-pipeline/correlation';
await runWithCorrelationId(job.id, () => this.commandBus.execute(command));
const id = getCorrelationId();
```

**4. The correlation ID of a running pipeline is read-only.** `originalCorrelationId` is
removed, and a behavior can no longer assign `context.correlationId`. Set the ID where the
work enters instead: `HttpCorrelationMiddleware`, `@WithCorrelation()` or
`runWithCorrelationId()`.

```typescript
// 0.1.x — inside a behavior
context.correlationId = request.headers['x-request-id'];

// 0.2.0 — where the work enters
await runWithCorrelationId(message.properties.correlationId, () =>
  this.commandBus.execute(command),
);
```

**5. Utilities move to their own packages.** Core no longer exports `uuidv7`, `isUuidV7` and
`untyped`, and `/correlation` no longer exports `uuidv7`:

```typescript
// 0.1.x
import { untyped, uuidv7 } from '@nestjs-pipeline/core';
import { uuidv7 } from '@nestjs-pipeline/correlation';

// 0.2.0
import { untyped } from '@cqrs-ddd/untyped';
import { isUuidV7, uuidv7 } from '@cqrs-ddd/uuidv7';
```

**6. Core internals are no longer exported.** `PipelineBootstrapService`,
`PIPELINE_MODULE_OPTIONS`, `PIPELINE_OPTIONS_REGISTRY`, `clearPipelineOptionsRegistry`,
`SET_RESPONSE` and `SET_ORIGINAL_CORRELATION_ID` are internal. Configure the pipeline through
`PipelineModule.forRoot` or the new `forRootAsync`:

```typescript
PipelineModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    bootstrapLogLevel: config.get('PIPELINE_LOG_LEVEL') ?? 'debug',
  }),
});
```

**7. Bootstrap diagnostics are strict by default.** The new `diagnostics` option defaults to
`'strict'`: a handler whose behavior declares a `PIPELINE_BEHAVIOR_CONTRACT` that the
handler's pipeline does not meet makes bootstrap throw a `PipelineConfigurationError`, which
lists each handler, behavior and fix. Fix the reported handler, or relax the check while you do:

```typescript
PipelineModule.forRoot({ sources: {}, diagnostics: 'warn' }); // or 'off'
```

**8. `loggerProvider` must provide `LOGGING_BEHAVIOR_LOGGER`.** The option was any NestJS
`Provider`; it is now `PipelineLoggerProvider`, whose `provide` must be that token:

```typescript
// 0.1.x
PipelineModule.forRoot({ loggerProvider: { provide: 'LOGGER', useClass: PinoLogger } });

// 0.2.0
import { LOGGING_BEHAVIOR_LOGGER } from '@nestjs-pipeline/core';
PipelineModule.forRoot({
  loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useClass: PinoLogger },
});
```

**9. A behavior without an explicit id is identified by its class.** `getBehaviorId()`
returns the class, not `cls.name`, and `PIPELINE_BEHAVIOR_ID` is a `Symbol.for` value. Code
that compared ids to strings must compare classes, or set an explicit id:

```typescript
// 0.1.x
if (getBehaviorId(entry) === 'AuditBehavior') { /* ... */ }

// 0.2.0
if (getBehaviorId(entry) === AuditBehavior) { /* ... */ }
```

**10. `LoggingBehavior` masks sensitive fields by default.** Keys such as `password`, `token`
and `refreshToken` (case, `_` and `-` ignored) are logged as `[REDACTED]`. To keep the 0.1.x
output for a handler:

```typescript
@UsePipeline([LoggingBehavior, { redactSensitiveKeys: false }])
```

**11. `@nestjs-pipeline/zod`: `ZOD_SCHEMA` is removed** (it was a deprecated alias), and `zod`
must be `^4.3.0`.

```typescript
// 0.1.x
static readonly [ZOD_SCHEMA] = userCreatedSchema;
// 0.2.0
static readonly [ZOD_SCHEMA_KEY] = userCreatedSchema;
```

**12. `ZodValidationBehavior` applies the parsed output to the request.** In 0.1.x it only
validated. It now parses asynchronously (`safeParseAsync`), deletes keys the schema strips,
and assigns coerced and defaulted values to the request before the handler runs. A schema
whose top-level output is not a plain object (an array, a primitive, a `Date`) is rejected
with a `TypeError`. A handler that read unknown or raw fields must declare them in the
schema. A class built with `createCommand()` or `createQuery()` keeps its original input:

```typescript
// 0.2.0
import { getRawInput } from '@nestjs-pipeline/zod';
const raw = getRawInput(command);
```

**13. `@nestjs-pipeline/casl`: one permission source replaces the providers.**
The module options `roleProvider`, `userCapabilityProvider`, `userContextResolver`,
`subjectContextPaths` and `defaultFieldsFromRequest` are removed, and `@casl/ability` must be
`^7.0.0`. The `CaslBehavior` options `subjectFromRequest`, `subjectContextPaths`,
`fieldsFromRequest`, `skipCheck` and `prebuiltAbility` are removed, and `rules` is required
and non-empty. The provider tokens (`CASL_ROLE_PROVIDER`, `CASL_USER_CAPABILITY_PROVIDER`,
`CASL_USER_CONTEXT_RESOLVER`, …), `StaticRoleProvider` and `buildAbilityFromRules` are removed,
and `buildAbility(roles, user, …)` becomes `buildAbility(rules, principal)`. Implement
`ICaslPermissionSource`, whose `load()` returns the caller and their rules, and check
entities and fields in the handler with `CaslAuthorizer`:

```typescript
// 0.1.x
CaslModule.forRoot({
  roleProvider: { useFactory: () => roleProvider },
  subjectContextPaths: ['sessionUser'],
  userCapabilityProvider: DatabaseUserCapabilityProvider,
});

@UsePipeline([CaslBehavior, { rules: [{ action: 'create', subject: 'Post' }] }])

// 0.2.0
@Injectable()
export class AppPermissionSource implements ICaslPermissionSource {
  constructor(private readonly grants: GrantRepository) {}

  async load(): Promise<CaslAuthorizationInput | null> {
    const session = currentSession();
    if (!session) return null; // unauthenticated: every gated handler is denied
    return {
      principal: { id: session.userId },
      rules: await this.grants.rulesFor(session.userId),
    };
  }
}

CaslModule.forRoot({
  imports: [AuthorizationModule],
  permissionSource: { useExisting: AppPermissionSource },
});

@UsePipeline(requires({ action: 'create', subject: 'Post' }))
```

**14. A CASL denial throws `UnauthorizedActionException`, not `ForbiddenException`.** It
extends `Error`, so without its filter NestJS answers HTTP 500. Register the filter to keep
the 403:

```typescript
import { APP_FILTER } from '@nestjs/core';
import { UnauthorizedActionFilter } from '@nestjs-pipeline/casl';

@Module({
  providers: [{ provide: APP_FILTER, useClass: UnauthorizedActionFilter }],
})
export class AppModule {}
```

Each package README has a full migration section:
[core](/nestjs-pipeline/packages/nestjs-pipeline/core/#migrating-from-01x),
[correlation](/nestjs-pipeline/packages/nestjs-pipeline/correlation/#migrating-from-01x),
[opentelemetry](/nestjs-pipeline/packages/nestjs-pipeline/opentelemetry/#migrating-from-01x),
[zod](/nestjs-pipeline/packages/nestjs-pipeline/zod/#migrating-from-01x),
[casl](/nestjs-pipeline/packages/nestjs-pipeline/casl/#migrating-from-01x),
[uuidv7](/nestjs-pipeline/packages/cqrs-ddd/uuidv7/#migrating-from-nestjs-pipelinecore-01x),
[untyped](/nestjs-pipeline/packages/cqrs-ddd/untyped/#migrating-from-nestjs-pipelinecore-01x) and
[safe-stringify](/nestjs-pipeline/packages/cqrs-ddd/safe-stringify/#migrating-from-nestjs-pipelinecore-01x).
