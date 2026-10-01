# @nestjs-pipeline/core

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/core.svg)](https://www.npmjs.com/package/@nestjs-pipeline/core)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/core.svg)](https://www.npmjs.com/package/@nestjs-pipeline/core)

Pipeline behaviors for **NestJS CQRS** — wrap every command, query, and event handler with reusable cross-cutting concerns using a clean middleware-like chain.

Its peer contract also includes the standard NestJS runtime peers
`reflect-metadata` and `rxjs`. Works with Express and Fastify.

---

## Table of Contents

- [Installation](#installation)
- [Migrating from 0.1.x](#migrating-from-01x)
- [Module Registration](#module-registration)
  - [forRoot()](#forroot)
  - [forFeature()](#forfeature)
  - [Async registration](#async-registration)
- [The @UsePipeline Decorator](#the-usepipeline-decorator)
- [Writing a Custom Behavior](#writing-a-custom-behavior)
- [Pipeline Context](#pipeline-context)
  - [Properties](#properties)
  - [Behavior Options](#behavior-options)
  - [Inter-Behavior Communication](#inter-behavior-communication)
- [Global Behaviors](#global-behaviors)
  - [Scoping](#scoping)
  - [Deduplication](#deduplication)
  - [Skipping Global Behaviors (@SkipPipeline)](#skipping-global-behaviors-skippipeline)
- [Built-in LoggingBehavior](#built-in-loggingbehavior)
- [Tenant and correlation ID](#tenant-and-correlation-id)
  - [HTTP Requests](#http-requests)
  - [Non-HTTP Entry Points](#non-http-entry-points)
  - [@WithCorrelation Decorator](#withcorrelation-decorator)
  - [Producer-Side Utilities](#producer-side-utilities)
  - [Reading the Current Correlation ID](#reading-the-current-correlation-id)
  - [Nested Commands and Sagas](#nested-commands-and-sagas)
- [Execution Model](#execution-model)
- [Bootstrap Diagnostics & Behavior Contracts](#bootstrap-diagnostics--behavior-contracts)
- [API Reference](#api-reference)
- [License](#license)

---

## Installation

```bash
pnpm add @nestjs-pipeline/core
```

Requires Node.js 22.12 or later.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from
0.3.x, see [Upgrading from 0.3.x](https://github.com/aristoteliss/nestjs-pipeline#upgrading-from-03x).

**Peer dependencies** (must be installed in your application). `@nestjs/common`,
`@nestjs/core` and `@nestjs/cqrs` must be `^12.1.0`: from 12.1, a subclass of a behavior
that declares no constructor of its own inherits the base class's `@Optional()` markers;
Nest 12.0.x drops them, so the subclass fails to resolve its optional dependencies:

```bash
pnpm add @nestjs/common @nestjs/core @nestjs/cqrs reflect-metadata rxjs

# Optional: use pino as Nest logger
pnpm add nestjs-pino pino-http pino-pretty
```

---

## Migrating from 0.1.x

These steps lead to 0.2.0. To reach 0.4.0, continue with [Upgrading from 0.2.x](https://github.com/aristoteliss/nestjs-pipeline#upgrading-from-02x) and
[Upgrading from 0.3.x](https://github.com/aristoteliss/nestjs-pipeline#upgrading-from-03x) in the repository README.

0.2.0 contains the following breaking changes for applications on 0.1.18. The full list
is in the repository [CHANGELOG](https://github.com/aristoteliss/nestjs-pipeline/blob/master/CHANGELOG.md).

**NestJS 11 and Node.js 22.** The peers `@nestjs/common`, `@nestjs/core` and
`@nestjs/cqrs` are `^11.0.0`; NestJS 10 is no longer accepted.

**`sources` replaces `correlationIdFactory` and `correlationIdRunner`.**

```typescript
// 0.1.x
PipelineModule.forRoot({
  correlationIdFactory: getCorrelationId,
  correlationIdRunner: runWithCorrelationId,
});

// 0.2.0
import { correlationSource } from '@nestjs-pipeline/correlation';
import { tenantSource } from '@nestjs-pipeline/tenant';

PipelineModule.forRoot({
  sources: { tenantId: tenantSource, correlationId: correlationSource },
});
```

Omitting `sources` logs a bootstrap warning; `sources: {}` states that the application
uses neither store.

**`context.correlationId` is read-only, and `originalCorrelationId` is removed.** A
behavior can no longer replace the ID of a running pipeline. Set it where the work enters
the application instead:

```typescript
// 0.1.x, inside a behavior
context.correlationId = context.request.messageId;
const original = context.originalCorrelationId;

// 0.2.0, at the entry point
import { runWithCorrelationId } from '@nestjs-pipeline/correlation';

await runWithCorrelationId(message.id, () => commandBus.execute(command));
// inside a behavior, context.correlationId is now message.id
```

**Internal exports are removed.** `PipelineBootstrapService`, `PIPELINE_MODULE_OPTIONS`,
`PIPELINE_OPTIONS_REGISTRY`, `clearPipelineOptionsRegistry`, `SET_RESPONSE` and
`SET_ORIGINAL_CORRELATION_ID` are no longer exported. Configure the pipeline through
`forRoot` or `forRootAsync`, and read handler options through
`context.getBehaviorOptions()`:

```typescript
// 0.1.x
const options = PIPELINE_OPTIONS_REGISTRY.get('CreateUserHandler');
afterEach(() => clearPipelineOptionsRegistry());

// 0.2.0, inside a behavior
const options = context.getBehaviorOptions<AuditOptions>(AuditBehavior);
```

**Utilities moved to `@cqrs-ddd/*` packages.** The core no longer re-exports them:

```typescript
// 0.1.x
import { isUuidV7, untyped, uuidv7 } from '@nestjs-pipeline/core';

// 0.2.0
import { isUuidV7, uuidv7 } from '@cqrs-ddd/uuidv7';
import { untyped } from '@cqrs-ddd/untyped';
import { safeStringify, stableStringify } from '@cqrs-ddd/safe-stringify';
```

**`LoggingBehavior` redacts sensitive keys by default.** With payload logging enabled,
keys such as `password`, `token`, `authorization` and `cardNumber` are logged as
`[REDACTED]`. Opt out only when raw payloads are an explicit requirement:

```typescript
// 0.1.x logged these values in clear text
@UsePipeline([LoggingBehavior, { excludeRequestObj: false }])

// 0.2.0, to restore the previous output
@UsePipeline(logging({ excludeRequestObj: false, redactSensitiveKeys: false }))
```

**Behavior identity is the class, not its name.** Without `PIPELINE_BEHAVIOR_ID`,
two distinct classes with the same name are now two behaviors, and `getBehaviorId()`
returns the class instead of a string. Copies of one behavior loaded from separate
package instances deduplicate only through an explicit ID:

```typescript
// 0.2.0
export class AuditBehavior implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_ID] = '@acme/audit:AuditBehavior';
  // ...
}
```

**`loggerProvider` must provide `LOGGING_BEHAVIOR_LOGGER`.** The option is typed
`PipelineLoggerProvider` rather than any `Provider`:

```typescript
// 0.2.0
PipelineModule.forRoot({
  loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: Logger },
});
```

**Bootstrap diagnostics default to `'strict'`.** A behavior contract violation throws
`PipelineConfigurationError` from `app.init()`. Use `diagnostics: 'warn'` while fixing
existing declarations.

---

## Module Registration

### forRoot()

Import `PipelineModule` once in your root `AppModule`. There are two calling styles:

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule, LoggingBehavior } from '@nestjs-pipeline/core';

// ── Style 1: Full options object ──

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      // Global behaviors auto-wrap every handler
      globalBehaviors: {
        scope: 'all',                // 'commands' | 'queries' | 'events' | 'all'
        before: [LoggingBehavior],   // runs first (outermost)
        after:  [MetricsBehavior],   // runs closest to the handler
      },
      // Behaviors to register in DI (for @UsePipeline references)
      behaviors: [AuditBehavior],
    }),
  ],
})
export class AppModule {}

// ── Style 2: Simple array (DI registration only) ──

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot([LoggingBehavior, AuditBehavior]),
  ],
})
export class AppModule {}

// The array form is equivalent to { behaviors: [...] }:
// it registers providers for @UsePipeline references, but does not make those
// behaviors execute globally. Use globalBehaviors for global execution.
```

### forFeature()

Register feature-owned behaviors application-wide:

```typescript
import { Module } from '@nestjs/common';
import { PipelineModule } from '@nestjs-pipeline/core';

@Module({
  imports: [PipelineModule.forFeature([AuditBehavior, CachingBehavior])],
})
export class AuditModule {}
```

`PipelineModule` is global, and pipeline behavior lookup spans the application
graph. Once `AuditModule` is imported, `AuditBehavior` and `CachingBehavior` are
therefore available to `@UsePipeline()` references in any module. `forFeature()`
is an organizational registration API; it does not provide feature-local DI
isolation.

When a behavior injects services from another module, use the object form:

```typescript
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditDependenciesModule {}

@Module({
  imports: [
    PipelineModule.forFeature({
      imports: [AuditDependenciesModule],
      behaviors: [AuditBehavior], // injects AuditService
    }),
  ],
})
export class AuditModule {}
```

Dependency modules must export the providers the behaviors inject. Merely putting
those providers in the parent `AuditModule` does not make them visible inside
`PipelineModule`. The array form remains supported for behaviors whose dependencies
are already available (for example, from global modules).

`PipelineModuleFeatureOptions` configures DI registration only. Register
`forRoot()` or `forRootAsync()` once to initialize the pipeline. Configure behavior
execution options with `@UsePipeline([AuditBehavior, { ... }])` or root
`globalBehaviors`; registering a behavior with `forFeature()` does not automatically
execute it for every handler.

### Async registration

Nest builds the provider graph before an async factory runs, so the two
provider-graph fields — `behaviors` and `loggerProvider` — are declared on the
`forRootAsync()` call, not returned from the factory. The factory returns
`PipelineRuntimeOptions`, which is `PipelineModuleOptions` without them:

```typescript
PipelineModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],

  // Provider graph — evaluated before the factory.
  behaviors: [LoggingBehavior, ZodValidationBehavior],
  loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: MyLogger },

  // Runtime configuration — resolved from injected providers.
  useFactory: (config: ConfigService) => ({
    diagnostics: config.get('PIPELINE_DIAGNOSTICS'),
    globalBehaviors: [{ scope: 'all', before: [LoggingBehavior] }],
  }),
});
```

Global behaviors that do not depend on injected values can be declared
statically on the same call. Their classes are registered as providers, as with
`forRoot({ globalBehaviors })`, so they need no `behaviors` entry:

```typescript
PipelineModule.forRootAsync({
  inject: [ConfigService],
  globalBehaviors: [
    { scope: 'all', before: [logging({ requestResponseLogLevel: 'log' })] },
    { scope: 'commands', before: [[DeadLetterBehavior, { captureKinds: ['command'] }]] },
  ],
  useFactory: (config: ConfigService) => ({
    diagnostics: config.get('PIPELINE_DIAGNOSTICS'),
  }),
});
```

Static configs come first and any `globalBehaviors` the factory returns are
appended after them. A behavior keeps the position of its first occurrence
across the combined list; a later tuple for the same behavior supplies its
options only. A behavior that appears only in factory-returned configs must
still be listed in `behaviors`.

Returning either field from the factory raises a `TypeError` at bootstrap, so a
behavior list placed in the factory fails at startup rather than on the first
request.

The second example uses the `logging()` intent helper, imported from this package:

```typescript
import { logging, PipelineModule } from '@nestjs-pipeline/core';
```

A class can supply the runtime options instead of a factory. `useClass`
instantiates it inside the pipeline module; `useExisting` reuses a provider that
an imported module exports:

```typescript
import { Injectable, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { correlationSource } from '@nestjs-pipeline/correlation';
import {
  LoggingBehavior,
  PipelineModule,
  type PipelineOptionsFactory,
  type PipelineRuntimeOptions,
} from '@nestjs-pipeline/core';
import { tenantSource } from '@nestjs-pipeline/tenant';

@Injectable()
export class PipelineConfig implements PipelineOptionsFactory {
  constructor(private readonly config: ConfigService) {}

  createPipelineOptions(): PipelineRuntimeOptions {
    return {
      diagnostics: this.config.get('PIPELINE_DIAGNOSTICS') ?? 'strict',
      bootstrapLogLevel: 'log',
      sources: { tenantId: tenantSource, correlationId: correlationSource },
    };
  }
}

@Module({
  imports: [
    PipelineModule.forRootAsync({
      imports: [ConfigModule],
      useClass: PipelineConfig,
      globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
    }),
  ],
})
export class AppModule {}
```

`extraProviders` adds providers to the pipeline module and exports them, for
dependencies that the options class or the behaviors inject and that no imported
module provides.

---

## The @UsePipeline Decorator

Repeated behavior identities execute once at their first position. The last tuple
for that identity supplies its options; a bare repeat does not erase those options.
Constructor references are the default identity. An explicit `PIPELINE_BEHAVIOR_ID`
unifies copies of the same behavior across separately loaded packages.
Malformed declarations, including undefined classes from circular imports, raise
`TypeError` with the declaration location. `@SkipPipeline` accepts classes only.

Decorate `@CommandHandler`, `@QueryHandler`, or `@EventsHandler` classes to attach handler-specific behaviors:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline, LoggingBehavior } from '@nestjs-pipeline/core';

// Simple form — just list behavior classes
@CommandHandler(CreateUserCommand)
@UsePipeline(LoggingBehavior, AuditBehavior)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand): Promise<User> {
    // your domain logic
  }
}

// Typed intent builder form — type-checked options exported by addon packages
@CommandHandler(CreateUserCommand)
@UsePipeline(
  authorize({ action: 'create', subject: 'User' }),
  rateLimit({ points: 5, keyFactory: (ctx) => `${ctx.requestName}:${ctx.request.clientIp}` }),
  idempotent({
    keyFactory: createPartitionedIdempotencyKeyFactory({
      action: 'user.create',
      principal: (ctx) => ['user', ctx.items.get(CURRENT_USER_ID) as string],
      operation: (ctx) => ctx.request.idempotencyKey,
    }),
  }),
  audit({ action: 'user.create' }),
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand): Promise<User> {
    // your domain logic
  }
}

// Tuple form — low-level escape hatch passing options directly to specific behaviors
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [AuditBehavior, { action: 'user.create', severity: 'high' }],
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand): Promise<User> {
    // your domain logic
  }
}

// Event handler
@EventsHandler(UserCreatedEvent)
@UsePipeline(LoggingBehavior)
export class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
  handle(event: UserCreatedEvent): void {
    console.log(`User created: ${event.userId}`);
  }
}

// Query handler
@QueryHandler(GetUserQuery)
@UsePipeline(CachingBehavior)
export class GetUserHandler implements IQueryHandler<GetUserQuery> {
  async execute(query: GetUserQuery): Promise<User> {
    return this.userRepository.findById(query.userId);
  }
}
```

Behaviors execute **left-to-right**: the first one listed is the outermost wrapper.

> **Sagas** are NOT decorated with `@UsePipeline` — they are reactive stream factories. Commands a saga emits flow through the `CommandBus` and hit the target handler's pipeline automatically.

---

## Writing a Custom Behavior

Implement the `IPipelineBehavior` interface:

```typescript
import { Injectable } from '@nestjs/common';
import {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@nestjs-pipeline/core';

@Injectable()
export class MetricsBehavior implements IPipelineBehavior {
  constructor(private readonly metricsService: MetricsService) {}

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<any> {
    const start = performance.now();
    const labels = {
      kind: context.requestKind,     // 'command' | 'query' | 'event'
      name: context.requestName,     // 'CreateUserCommand'
      handler: context.handlerName,  // 'CreateUserHandler'
    };

    try {
      const result = await next();
      this.metricsService.record('pipeline.success', performance.now() - start, labels);
      return result;
    } catch (error) {
      this.metricsService.record('pipeline.failure', performance.now() - start, labels);
      throw error;
    }
  }
}
```

The `next()` call is what advances the chain. Code before `next()` runs before the handler; code after runs after:

```typescript
@Injectable()
export class TimingBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    console.log(`→ Starting ${context.requestName}`);  // BEFORE

    const result = await next();                        // HANDLER RUNS HERE

    console.log(`← Finished ${context.requestName}`);  // AFTER
    // context.response is now available
    return result;
  }
}
```

---

## Pipeline Context

### Properties

Every behavior receives `IPipelineContext`:

| Property | Type | Description |
|---|---|---|
| `correlationId` | `string` | Immutable ID fixed before the behavior chain starts |
| `tenantId` | `string \| undefined` | Current tenant when the pipeline started; write-once |
| `request` | `TRequest` | The command / query / event instance |
| `requestType` | `Type<TRequest>` | Class constructor (e.g. `CreateUserCommand`) |
| `requestName` | `string` | Class name string (e.g. `"CreateUserCommand"`) |
| `handlerType` | `Type` | Handler class constructor |
| `handlerName` | `string` | Handler class name (e.g. `"CreateUserHandler"`) |
| `requestKind` | `'command' \| 'query' \| 'event' \| 'unknown'` | Auto-detected from `@nestjs/cqrs` metadata |
| `startedAt` | `Date` | UTC timestamp of pipeline start |
| `response` | `TResponse \| undefined` | Set after `next()` returns; `undefined` before the handler runs |
| `items` | `Map<string \| symbol, unknown>` | Shared bag for inter-behavior communication |

### Behavior Options

Pass per-handler options using the `[Behavior, { ... }]` tuple form and retrieve with `getBehaviorOptions()`:

```typescript
// Handler
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [AuditBehavior, { action: 'user.create', severity: 'high' }],
)
export class CreateUserHandler { /* ... */ }

// Inside AuditBehavior
async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
  const opts = context.getBehaviorOptions<AuditOptions>(AuditBehavior);
  console.log(opts);  // → { action: 'user.create', severity: 'high' }
  return next();
}
```

Global and handler option **maps** are combined. When the same behavior appears
at both levels, the handler inherits the global options and patches the fields
it names — `{ ...global, ...handler }` — while the behavior retains its global
chain position. The merge is one level deep: naming a nested object such as
`retry` replaces that object entirely rather than merging into it.

### Inter-Behavior Communication

Use a shared `PipelineItemToken<T>` to pass typed data between behaviors. Define
and export the token once; each `createPipelineItem` call creates a distinct
symbol, even when names match.

```typescript
import {
  createPipelineItem, getPipelineItem, setPipelineItem,
  requirePipelineItem, hasPipelineItem,
  type IPipelineContext,
} from '@nestjs-pipeline/core';

export const CURRENT_USER_ID = createPipelineItem<string>('currentUserId');

export function populateIdentity(context: IPipelineContext, userId: string) {
  setPipelineItem(context, CURRENT_USER_ID, userId);
}

export function readIdentity(context: IPipelineContext) {
  const optional = getPipelineItem(context, CURRENT_USER_ID); // string | undefined
  const present = hasPipelineItem(context, CURRENT_USER_ID); // boolean
  const required = requirePipelineItem(
    context, CURRENT_USER_ID, 'Run the identity behavior before this consumer.',
  ); // string
  return { optional, present, required };
}
```

| Accessor | Behavior |
|---|---|
| `createPipelineItem<T>(name, key?)` | Creates a token; an explicit string or symbol preserves an existing key's identity |
| `getPipelineItem(context, token)` | Returns `T \| undefined` |
| `setPipelineItem(context, token, value)` | Writes a value checked against the token's type |
| `requirePipelineItem(context, token, customMessage?)` | Throws `MissingPipelineItemError` for an absent or `undefined` value |
| `hasPipelineItem(context, token)` | Uses map presence; returns `true` for an explicitly stored `undefined` |

`MissingPipelineItemError` exposes `itemName`, `requestName`, and `handlerName`.
Its message includes all three and a population hint; `customMessage` adds detail.
Required reads return `null`, `false`, `0`, and empty strings unchanged. Consumers
must validate these values separately when their policy disallows them.

The raw `Map<string | symbol, unknown>` remains available. Wrap existing keys to
share data with integrations without replacing their exported symbols:

```typescript
const EXISTING_KEY = Symbol('principal');
const PRINCIPAL = createPipelineItem<{ id: string }>('principal', EXISTING_KEY);
context.items.set(EXISTING_KEY, { id: 'user-1' });
const principal = requirePipelineItem(context, PRINCIPAL);
```

All accessors also accept raw strings or symbols; reads then default to `unknown`
unless the caller supplies a type argument. Types do not validate raw map writes
at runtime. Required reads enforce presence, not authentication or authorization.
Explicit keys share entries when equal; only default symbol keys avoid collisions.
The token API uses TypeScript's `NoInfer` utility (TypeScript 5.4 or newer).


---

## Global Behaviors

### Scoping

Global behaviors can be scoped to specific handler kinds. Pass a single object or an array for per-kind control:

```typescript
// All handler kinds (single object)
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [LoggingBehavior],
    after:  [MetricsBehavior],
  },
})

// Commands only
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'commands',
    before: [AuditBehavior],
  },
})

// Queries only
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'queries',
    before: [CachingBehavior],
  },
})

// Events only
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'events',
    before: [LoggingBehavior],
  },
})

// Array form — different scopes for different handler kinds
PipelineModule.forRoot({
  globalBehaviors: [
    { scope: 'commands', before: [AuditBehavior] },
    { scope: 'queries',  before: [CachingBehavior] },
    { scope: 'all',      after:  [LoggingBehavior] },
  ],
})
```

Options can be passed to global behaviors using the tuple form:

```typescript
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [
      [LoggingBehavior, { metricLogLevel: 'verbose', requestResponseLogLevel: 'debug' }],
    ],
  },
})
```

### Deduplication

When the same behavior appears in both global and handler-level configurations,
it runs once, at its global chain position, with the global options patched by
the handler's fields. Global duplicates are deduplicated:

```typescript
// Global: LoggingBehavior with default options
PipelineModule.forRoot({
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
})

// Handler: overrides options without relocating the global behavior
@CommandHandler(CreateUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class CreateUserHandler { /* ... */ }

// Effective chain: [LoggingBehavior at global-before position, global options
// patched by the handler options] → handler
```

A redeclaration inherits the global options rather than clearing them, so a
handler only states what differs:

```typescript
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [[TraceBehavior, { tracerName: 'users-api', recordRequest: true }]],
  },
})

// Inherits both fields — this is the natural way to say "yes, trace this
// handler too".
@UsePipeline(TraceBehavior)
export class GetUserHandler { /* ... */ }

// Inherits tracerName: 'users-api' and overrides only recordRequest.
@UsePipeline([TraceBehavior, { recordRequest: false }])
export class NoisyHandler { /* ... */ }
```

There is no opt-out token. To run a behavior on the package defaults despite an
application-wide configuration, state those values explicitly — a handler that
silently discards application configuration is the failure mode this
inheritance exists to prevent.

Place mandatory authentication/authorization behaviors in global `before`.
Their position remains outside handler-level cache/idempotency behaviors that
can return without invoking `next()`.

This only protects authorization performed by the outer behavior. If the
handler later performs entity-level checks or response-field filtering, cache
and idempotency keys must be partitioned by the applicable tenant, principal,
and permission scope because a short-circuit hit does not execute the handler.

### Skipping Global Behaviors (@SkipPipeline)

To completely exclude one or more globally configured behaviors from running on a specific handler, decorate the handler class with `@SkipPipeline`:

```typescript
import { SkipPipeline } from '@nestjs-pipeline/core';

@CommandHandler(InternalRebuildCommand)
@SkipPipeline(AuditBehavior)
export class InternalRebuildHandler implements ICommandHandler<InternalRebuildCommand> {
  async execute(command: InternalRebuildCommand) {
    // AuditBehavior does not run.
    // Remaining global behaviors (e.g. LoggingBehavior) execute in their normal order.
  }
}
```

Several behaviors can be skipped at once, and the decorator combines with
`@UsePipeline` for other behaviors:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { logging, SkipPipeline, UsePipeline } from '@nestjs-pipeline/core';

@CommandHandler(HealthProbeCommand)
@SkipPipeline(AuditBehavior, MetricsBehavior)
@UsePipeline(logging({ metricLogLevel: 'debug' }))
export class HealthProbeHandler implements ICommandHandler<HealthProbeCommand> {
  async execute(): Promise<void> {}
}
```

Key rules:
- **All behaviors skipped:** The handler runs without creating a new pipeline context. Request-scoped handlers remain isolated when multiple Nest applications share the same handler class, including across application startup and shutdown order.
- **No relocation:** Skipping one behavior does not shift or reorder the remaining behaviors.
- **Fail-fast on contradiction:** Declaring both `@SkipPipeline(B)` and `@UsePipeline(B)` (or providing options for `B`) is contradictory configuration and causes bootstrap to fail immediately with an explicit error.
- **Handler types:** Supported on command, query, and event handlers across singleton and request-scoped lifecycles.

---

## Built-in LoggingBehavior

Logging and payload serialization failures do not prevent execution or replace the
handler's result or error. `next()` is invoked once. Error `optionalParams` receive
the same key exclusion and redaction as request/response payloads. Free-form error
messages and stacks are not field-redacted; do not put credentials in them.

The package includes `LoggingBehavior` for structured pipeline logging via the NestJS `Logger`:

```typescript
import { LoggingBehavior } from '@nestjs-pipeline/core';

PipelineModule.forRoot({
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
})
```

**Options** (`LoggingBehaviorOptions`):

| Option | Type | Default | Description |
|---|---|---|---|
| `metricLogLevel` | `LogLevel \| 'none'` | `'log'` | Log level for timing/duration messages |
| `requestResponseLogLevel` | `LogLevel \| 'none'` | `'debug'` | Log level for request/response payloads |
| `errorLogLevel` | `LogLevel \| 'none'` | `'error'` | Log level when an error happened |
| `mapLogLevel` | `Map<ErrorClass, LogLevel \| 'none'>` | `undefined` | Specific log levels mapped by exception error class (most specific match in prototype chain wins) |
| `excludeKeys` | `string[]` | `[]` | Keys to omit from request/response logs (supports dot notation for nested properties, e.g. `'ctx.sessionUser'`) |
| `redactKeys` | `string[]` | `[]` | Additional keys or dot-paths masked with `[REDACTED]`; unlike `excludeKeys`, the property stays in the payload |
| `redactSensitiveKeys` | `boolean` | `true` | Masks `DEFAULT_REDACT_KEYS` of `@cqrs-ddd/safe-stringify` (passwords, tokens, authorization, cookies, API keys, card data). Matching ignores case, `_` and `-` |
| `excludeRequestObj` | `boolean` | `true` | If true, omits the request object from logs entirely (shows placeholder instead) |
| `excludeResponseObj` | `boolean` | `true` | If true, omits the response object from logs entirely (shows placeholder instead) |
| `logFormat` | `'text' \| 'structured'` | `'text'` | Output shape for request/response/metric/error logs. `'text'` emits a single interpolated string; `'structured'` emits a plain object payload (e.g. `{ msg, request }` for request/response, `{ message, stack, ... }` for errors) — suitable for structured loggers like `nestjs-pino`/pino that serialize objects into JSON fields |

When the wrapped handler throws, the logged error entry is also enriched with:
- the error's `stack`, if it's an `Error` instance;
- the error's `optionalParams`, if the thrown value defines one — normalized into an array and merged into the logged payload, so any extra context an exception carries beyond `message`/`stack` still reaches the logs.

The original error is always re-thrown unchanged after logging, so `LoggingBehavior` only observes failures — it never swallows them.

Provide your own logger through the `loggerProvider` option, whose `provide` token
must be `LOGGING_BEHAVIOR_LOGGER` (for example with `nestjs-pino`, whose global
`LoggerModule` exports `Logger`):

```typescript
import { Module } from '@nestjs/common';
import { Logger, LoggerModule } from 'nestjs-pino';
import {
  LOGGING_BEHAVIOR_LOGGER,
  LoggingBehavior,
  PipelineModule,
} from '@nestjs-pipeline/core';

@Module({
  imports: [
    LoggerModule.forRoot(),
    PipelineModule.forRoot({
      globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
      bootstrapLogLevel: 'verbose',
      loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: Logger },
    }),
  ],
})
export class AppModule {}
```

Payload logging is off by default. When it is enabled, sensitive keys are masked
unless `redactSensitiveKeys` is `false`:

```typescript
@CommandHandler(RegisterCardCommand)
@UsePipeline(
  logging({
    excludeRequestObj: false,
    excludeKeys: ['ctx.sessionUser'],        // removed from the output
    redactKeys: ['profile.email', 'iban'],   // kept, value replaced by [REDACTED]
  }),
)
export class RegisterCardHandler { /* ... */ }
// Request: {"cardNumber":"[REDACTED]","iban":"[REDACTED]","profile":{"email":"[REDACTED]"}}
```

Nest log levels map to pino as:
`verbose` → `trace`, `debug` → `debug`, `log` → `info`, `warn` → `warn`, `error` → `error`, `fatal` → `fatal`.

```typescript
import { logging } from '@nestjs-pipeline/core';

// Override options per handler
@CommandHandler(CreateUserCommand)
@UsePipeline(logging({ requestResponseLogLevel: 'log' }))
export class CreateUserHandler { /* ... */ }

// Map specific exceptions to different log levels (e.g. log constraint violations as warnings)
@UsePipeline(logging({ 
  mapLogLevel: new Map([
    [UniqueConstraintException, 'warn'],
    [NotFoundException, 'debug'],
  ]) 
}))

// Disable payload logging, keep metrics
@UsePipeline(logging({ requestResponseLogLevel: 'none' }))

// Silence all logging
@UsePipeline(logging({ metricLogLevel: 'none', requestResponseLogLevel: 'none', errorLogLevel: 'none' }))

// Emit structured objects instead of strings (e.g. for nestjs-pino)
@UsePipeline(logging({ logFormat: 'structured' }))
```

**Output** (success, default `logFormat: 'text'`, with default `excludeRequestObj`/`excludeResponseObj`):

```
[CreateUserHandler] Request: [exclude request obj]
[CreateUserHandler] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler completed in 12.34ms
[CreateUserHandler] Response: [exclude response obj]
```

With `excludeRequestObj: false, excludeResponseObj: false`:

```
[CreateUserHandler] Request: {"username":"jane","email":"jane@example.com"}
[CreateUserHandler] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler completed in 12.34ms
[CreateUserHandler] Response: {"id":"...","username":"jane"}
```

**Output** (error, default `logFormat: 'text'`):

```
[CreateUserHandler] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler failed after 2.10ms: Error: User already exists
```

**Output** (`logFormat: 'structured'`):

With `logFormat: 'structured'`, the same events are emitted as plain objects instead of interpolated strings — handy for loggers like `nestjs-pino` that serialize objects into JSON fields:

```typescript
// Request
{ msg: 'Request → CreateUserHandler', request: '[exclude request obj]' }

// Metric (on success)
{
  msg: '[019728a3-...] COMMAND CreateUserCommand → CreateUserHandler completed in 12.34ms',
  correlationId: '019728a3-...',
  requestKind: 'command',
  requestName: 'CreateUserCommand',
  handlerName: 'CreateUserHandler',
  durationMs: 12.34,
}

// Response
{ msg: 'Response ← CreateUserHandler', response: '[exclude response obj]' }

// Error
{
  message: '[019728a3-...] COMMAND CreateUserCommand → CreateUserHandler failed after 2.10ms: Error: User already exists',
  stack: 'Error: User already exists\n    at ...',
  // ...any optionalParams the thrown error carried, merged in here
}
```

---

## Tenant and correlation ID

The core keeps no tenant or correlation store of its own. Each value has a source, a
`ContextSource` (`current()` and `run(value, fn)`), given in the `sources` module option.
[`@nestjs-pipeline/tenant`](https://github.com/aristoteliss/nestjs-pipeline/tree/master/packages/pipeline-tenant)
and
[`@nestjs-pipeline/correlation`](https://github.com/aristoteliss/nestjs-pipeline/tree/master/packages/pipeline-correlation)
own those stores and depend on nothing here; they export them as `tenantSource` and
`correlationSource`:

```typescript
import { correlationSource } from '@nestjs-pipeline/correlation';
import { tenantSource } from '@nestjs-pipeline/tenant';

PipelineModule.forRoot({
  sources: { tenantId: tenantSource, correlationId: correlationSource },
});
```

The application then uses their API: `runWithTenant`, `currentTenantId`,
`HttpCorrelationMiddleware`, `runWithCorrelationId`, `getCorrelationId`,
`@WithCorrelation`. Without `sources`, bootstrap logs a warning once handlers are
wrapped, since handlers then cannot read the pipeline's tenant or correlation ID; pass
`sources: {}` to run without them on purpose (or set `diagnostics: 'off'`).

When a pipeline starts, it fills its context:

- `context.correlationId` — the source's current ID, or a new one from its `create()`;
  without a source, that of the pipeline it is nested in, or a new `uuidv7()`;
- `context.tenantId` — the source's current tenant; without a source, that of the
  pipeline it is nested in; otherwise none. It is write-once.

The behaviors and the handler then run inside both sources holding these values, so a
nested dispatch (saga, `eventBus.publish()`, a command sent from a handler) inherits them,
and `getCorrelationId()` or `currentTenantId()` deep inside the handler returns what the
behaviors keyed on. A pipeline dispatched inside a narrower `runWithTenant` takes that
tenant.

```typescript
import { runWithCorrelationId } from '@nestjs-pipeline/correlation';
import { runWithTenant } from '@nestjs-pipeline/tenant';

await runWithTenant('tenant_a', () =>
  runWithCorrelationId(job.id, () => commandBus.execute(new SyncCommand())),
);
```

Without a tenant, tenant-scoped behaviors (cache, idempotency, rate limit) fail closed.

A behavior reads both values from its context. A behavior that keys shared state by
tenant builds the tenant segment with `tenantSegments`, which throws the given
`MissingPartitionError` subclass when a required tenant is absent:

```typescript
import {
  MissingPartitionError,
  type IPipelineContext,
  type TenantPartitionOptions,
  tenantSegments,
} from '@nestjs-pipeline/core';

export class MissingQuotaPartitionError extends MissingPartitionError<'tenant'> {
  constructor(requestName: string, dimension: 'tenant', remedy: string) {
    super('Quota', requestName, dimension, remedy);
  }
}

export function quotaKey(context: IPipelineContext, options: TenantPartitionOptions = {}) {
  return [...tenantSegments(context, options, MissingQuotaPartitionError), context.requestName]
    .map((segment) => encodeURIComponent(segment ?? ''))
    .join(':');
}
```

A simpler behavior can check the tenant directly:

```typescript
import { Injectable } from '@nestjs/common';
import type {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@nestjs-pipeline/core';

@Injectable()
export class TenantRequiredBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate): Promise<unknown> {
    if (context.tenantId === undefined) {
      throw new Error(`${context.requestName} requires a tenant (${context.correlationId})`);
    }
    return next();
  }
}
```

### HTTP Requests

HTTP correlation ID extraction is provided by `@nestjs-pipeline/correlation`. Install it and apply the middleware:

```typescript
import { HttpCorrelationMiddleware } from '@nestjs-pipeline/correlation';

@Module({ /* ... */ })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}
```

```bash
curl -X POST http://localhost:3000/users \
  -H 'x-correlation-id: req-abc-123' \
  -H 'Content-Type: application/json' \
  -d '{"name": "Jane", "email": "jane@example.com"}'
```

### Non-HTTP Entry Points

For Bull queues, RabbitMQ, Kafka, cron jobs, etc., use utilities from `@nestjs-pipeline/correlation`:

```typescript
import { uuidv7 } from '@cqrs-ddd/uuidv7';
import { runWithCorrelationId } from '@nestjs-pipeline/correlation';

// Bull queue processor
@Process('send-email')
async handleSendEmail(job: Job) {
  return runWithCorrelationId(job.data.correlationId, async () => {
    await this.commandBus.execute(new SendEmailCommand(job.data));
  });
}

// Cron job
@Cron('0 * * * *')
async hourlySync() {
  return runWithCorrelationId(uuidv7(), () =>
    this.commandBus.execute(new SyncCommand()),
  );
}
```

### @WithCorrelation Decorator

Instead of manually calling `runWithCorrelationId`, use the `@WithCorrelation()` method decorator from `@nestjs-pipeline/correlation`:

```typescript
import { WithCorrelation, CorrelationFrom, getCorrelationId } from '@nestjs-pipeline/correlation';

// ── Bull (reads from job.data.correlationId by default) ──
@Process('send-email')
@WithCorrelation()
async handleSendEmail(job: Job) {
  const id = getCorrelationId();
  await this.commandBus.execute(new SendEmailCommand(job.data));
}

// ── RabbitMQ (AMQP properties) ──
@MessagePattern('user.created')
@WithCorrelation(CorrelationFrom.amqp())
async handle(@Payload() data: any, @Ctx() ctx: RmqContext) {
  await this.commandBus.execute(new SyncUserCommand(data));
}

// ── Kafka (message headers) ──
@EventPattern('order.placed')
@WithCorrelation(CorrelationFrom.kafka())
async handle(@Payload() data: any, @Ctx() ctx: KafkaContext) {
  await this.commandBus.execute(new ProcessOrderCommand(data));
}

// ── NATS / gRPC ──
@WithCorrelation(CorrelationFrom.nats())
@WithCorrelation(CorrelationFrom.grpc())

// ── Cron (no ID in args → auto-generates uuidv7) ──
@Cron('0 * * * *')
@WithCorrelation()
async hourlySync() {
  await this.commandBus.execute(new SyncCommand());
}
```

### Producer-Side Utilities

When enqueuing jobs or publishing messages, stamp the current correlation ID onto the payload or headers:

```typescript
import { addCorrelationId, correlationHeaders } from '@nestjs-pipeline/correlation';

// Bull / BullMQ — stamp onto data payload
await queue.add('send-email', addCorrelationId({ userId, email }));
// → { userId, email, correlationId: '019728a3-...' }

// Kafka — stamp as message headers
await producer.send({
  topic: 'orders',
  messages: [{ value: JSON.stringify(order), headers: correlationHeaders() }],
});

// HTTP (outgoing)
await fetch(url, { headers: { ...correlationHeaders(), 'content-type': 'application/json' } });
```

### Reading the Current Correlation ID

Use `getCorrelationId()` from `@nestjs-pipeline/correlation` anywhere in the async call stack:

```typescript
import { getCorrelationId } from '@nestjs-pipeline/correlation';

const id = getCorrelationId(); // reads from async-local context, falls back to uuidv7()
```

### Nested Commands and Sagas

Child pipelines automatically inherit the parent's `correlationId` via `AsyncLocalStorage`:

```typescript
// This saga emits a command — it will inherit the correlationId
// from the event handler's pipeline context
@Saga()
orderCreated = (events$: Observable<any>): Observable<ICommand> =>
  events$.pipe(
    ofType(OrderCreatedEvent),
    map((event) => new SendConfirmationCommand({ orderId: event.orderId })),
  );
```

---

## Execution Model

```
┌─ global before ──┐   ┌── @UsePipeline ──┐   ┌─ global after ──┐
│ LoggingBehavior  │ → │ AuditBehavior    │ → │ MetricsBehavior │ → handler.execute()
└──────────────────┘   └──────────────────┘   └─────────────────┘
                    ← response propagates back through the chain ←
```

| Phase | Source | Position |
|---|---|---|
| Global `before` | `globalBehaviors.before` | Outermost (first to run) |
| Handler-level | `@UsePipeline(...)` | Middle |
| Global `after` | `globalBehaviors.after` | Innermost (closest to handler) |
| Handler | `execute()` / `handle()` | Core |

**Bootstrap process:**

1. `PipelineBootstrapService` runs at `OnApplicationBootstrap`.
2. Discovers the command, query and event handlers through Nest's `DiscoveryService`. A
   provider is a handler when its class carries the metadata that `@CommandHandler`,
   `@QueryHandler` or `@EventsHandler` records, the rule Nest CQRS applies when it
   registers handlers. If the installed `@nestjs/cqrs` records that metadata in an
   unexpected way, bootstrap fails instead of leaving handlers unwrapped.
3. For each handler with `@UsePipeline` or matching global behaviors: computes effective behavior/handler metadata, resolves singleton behavior instances, and wraps the `execute()` / `handle()` method. Behaviors that cannot be resolved as singletons are marked for dynamic resolution.
4. Request-independent metadata is computed once at startup. The common all-singleton path reuses pre-resolved behavior instances with no per-request reflection/behavior DI lookup; request-scoped/transient behaviors are resolved per invocation with `moduleRef.resolve()` and the applicable Nest context ID.
5. Requires Nest and Nest CQRS 12. Request-scoped and transient handlers
   (`Scope.REQUEST`, `Scope.TRANSIENT`) rely on `AsyncContext`, which earlier
   CQRS versions do not provide.

---

### Lifecycle and inheritance

If pipeline bootstrap fails, it restores the methods and Nest instance hooks it
installed before rethrowing the original error. Application shutdown removes only
that application's runners. Inherited handler methods retain their original
property descriptors and prototype inheritance after cleanup. A handler override
can call `super.execute(request)` without entering the ancestor's pipeline again.

Dispatch ownership is tracked separately for `execute` and `handle`, including
when one scoped provider handles both commands and events. Invoke handlers through
Nest's CQRS buses. A manually constructed scoped instance has no application
ownership: it uses the sole registered chain when unambiguous, and throws instead
of running the handler without a pipeline when several applications share its
prototype.

Internally, `pipeline-plan.ts` composes declarations and options,
`pipeline-contracts.ts` validates contracts, and `pipeline-runner.ts` creates the
request context and executes the chain. `PipelineBootstrapService` owns discovery,
Nest provider resolution, method installation and cleanup. These helpers are
internal and are not exported by the package entry point.

## Bootstrap Diagnostics & Behavior Contracts

`@nestjs-pipeline/core` includes an eager bootstrap diagnostics mechanism that validates pipeline behavior ordering constraints and declarative configuration invariants during `OnApplicationBootstrap`.

### Diagnostics Modes

Configure `diagnostics` in `PipelineModule.forRoot()`:

| Mode | Behavior |
|---|---|
| `'strict'` *(default)* | Collects all violations across handlers and throws `PipelineConfigurationError` during `app.init()`, failing fast before traffic is served. |
| `'warn'` | Logs formatted diagnostic warnings via Nest `Logger` but allows bootstrap to complete. |
| `'off'` | Bypasses contract inspection completely. |

```typescript
PipelineModule.forRoot({
  diagnostics: 'strict', // 'strict' | 'warn' | 'off'
})
```

### IPipelineBehaviorContract

Behaviors declare safety invariants and relative ordering constraints by attaching the well-known symbol `PIPELINE_BEHAVIOR_CONTRACT`:

```typescript
import {
  IPipelineBehavior,
  IPipelineBehaviorContract,
  IPipelineContext,
  NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  PipelineBehaviorDiagnostic,
  PipelineBehaviorValidationContext,
} from '@nestjs-pipeline/core';

export class CustomSecurityBehavior implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    // Relative ordering constraint: static rule or dynamic function of handler context
    order: (context: PipelineBehaviorValidationContext) => {
      // e.g. enforce ordering only for commands
      if (context.requestKind === 'command') {
        return { after: ['CaslBehavior'] };
      }
      return undefined;
    },

    // Deterministic option validation
    validate: (context: PipelineBehaviorValidationContext): PipelineBehaviorDiagnostic[] | undefined => {
      if (!context.effectiveOptions?.secretKey) {
        return [{
          handlerName: context.handlerName,
          behaviorName: CustomSecurityBehavior.name,
          message: 'CustomSecurityBehavior requires secretKey',
          fix: 'Provide secretKey in handler @UsePipeline options or module defaults.',
        }];
      }
      return undefined;
    },
  };

  async handle(context: IPipelineContext, next: NextDelegate) {
    return next();
  }
}
```

### Option Precedence & Effective Options

When validating options at bootstrap, the bootstrap service resolves effective options in the exact precedence order used at runtime:
1. Module defaults: Injected via addon dynamic module `forRoot({ defaults: { ... } })` or module options.
2. Global pipeline options: Declared in `PipelineModule.forRoot({ globalBehaviors: [ ... ] })`.
3. Per-handler options: Attached via `@UsePipeline([Behavior, { ... }])` on the handler class.

If a behavior implements `resolveEffectiveOptions(rawMergedOptions)`, bootstrap
invokes it when a singleton instance is available. Scoped behaviors have no
request instance at bootstrap: their static contracts receive the raw merged
handler/global options and `behaviorInstance: undefined`. Instance-only contracts
and request-dependent defaults cannot be checked eagerly. Scoped implementations
must validate request-dependent configuration in `handle()`; static validators
must account for the absent instance.

---

## API Reference

### Exports

| Export | Type | Description |
|---|---|---|
| `PipelineModule` | Module | `.forRoot()`, `.forRootAsync()` and `.forFeature()` registration |
| `UsePipeline` | Decorator | Attach behaviors to CQRS handlers |
| `SkipPipeline` | Decorator | Exclude global behaviors from a specific CQRS handler |
| `IPipelineBehavior` | Interface | Behavior contract: `handle(context, next)` |
| `IPipelineContext` | Interface | Rich execution context |
| `NextDelegate` | Type | `() => Promise<TResponse>` |
| `BasePipelineContext` | Class | Extensible base — override if you need custom contexts |
| `PipelineContext` | Class | Concrete context created per invocation |
| `LoggingBehavior` | Class | Built-in structured logging |
| `LoggingBehaviorOptions` | Interface | Options for `LoggingBehavior` (`metricLogLevel`, `requestResponseLogLevel`, `errorLogLevel`, `mapLogLevel`, `excludeKeys`, `redactKeys`, `redactSensitiveKeys`, `excludeRequestObj`, `excludeResponseObj`, `logFormat`) |
| `ErrorClass` | Type | An error class used as a `mapLogLevel` key; it also matches its subclasses |
| `logging` | Function | Typed intent builder returning `[LoggingBehavior, options]` for `@UsePipeline` |
| `LoggingIntentOptions` | Type | Alias for `LoggingBehaviorOptions` |
| `pipelineStore` | `AsyncLocalStorage` | Access the current pipeline context |
| `TenantPartitionOptions`, `tenantSegments` | Type, function | The tenant segment of a partitioned key and its options, shared by the cache, idempotency and rate-limit key factories |
| `MissingPartitionError` | Class | Base of the packages' partition errors (`MissingCachePartitionError`, …): `{ requestName, dimension, remedy }` |
| `ContextSource`, `CorrelationSource`, `ContextSources` | Types | The `sources` option: where pipelines take their tenant and correlation ID from; a correlation source also has `create()` |
| `PipelineModuleOptions` | Interface | Options for `PipelineModule.forRoot()` |
| `PipelineModuleAsyncOptions`, `PipelineOptionsFactory`, `PipelineRuntimeOptions` | Types | `forRootAsync()` options, the `useClass`/`useExisting` factory contract, and what a factory returns |
| `PipelineModuleFeatureOptions` | Interface | Object form of `forFeature()`: `{ imports, behaviors }` |
| `PipelineLoggerProvider` | Type | A provider whose `provide` is `LOGGING_BEHAVIOR_LOGGER` |
| `LOGGING_BEHAVIOR_LOGGER` | Symbol | Injection token of the logger `LoggingBehavior` uses |
| `GlobalBehaviorsOptions` | Interface | Global behavior configuration |
| `GlobalBehaviorScope` | Type | `'commands' \| 'queries' \| 'events' \| 'all'` |
| `PipelineItemToken<T>` | Interface | Typed context map key |
| `createPipelineItem`, `getPipelineItem`, `setPipelineItem`, `requirePipelineItem`, `hasPipelineItem` | Functions | Typed context item accessors |
| `MissingPipelineItemError` | Class | Required item is absent or undefined |
| `PipelineHandlerMeta` | Interface | Pre-computed handler metadata |
| `PIPELINE_BEHAVIOR_CONTRACT` | Symbol | Symbol key for declaring behavior contracts on behavior classes |
| `PIPELINE_BEHAVIOR_ID` | Symbol | Custom deduplication and contract identity key for behaviors |
| `PipelineConfigurationError` | Class | Error thrown when bootstrap contract diagnostics find issues |
| `PipelineBehaviorDiagnostic` | Interface | Structure of a single diagnostic issue |
| `IPipelineBehaviorOptionsResolver` | Interface | Optional behavior instance method `resolveEffectiveOptions` that merges module defaults; bootstrap diagnostics pass its result to contract validators as `effectiveOptions` |
| `PipelineBehaviorValidationContext` | Interface | Handler and option inspection context supplied to contract validators |
| `PIPELINE_SKIPPED_BEHAVIORS_METADATA` | Symbol | Metadata key for skipped behavior classes |
| `SET_TENANT_ID` | Symbol | Write-once symbol setter for `tenantId`, for custom runners constructing a context; assigning a different tenant throws |
| `PipelineBehaviorEntry`, `PipelineBehaviorTuple` | Types | `Type<TBehavior> \| [Type<TBehavior>, TOptions]`, and the tuple alone, as returned by intent helpers |
| `getBehaviorId`, `BehaviorId` | Function, type | The identity used for deduplication: `PIPELINE_BEHAVIOR_ID` when set, otherwise the class itself |
| `PIPELINE_BEHAVIORS_METADATA`, `PIPELINE_BEHAVIORS_OPTIONS_METADATA` | Symbols | Metadata keys written by `@UsePipeline` |
| `IPipelineBehaviorContract`, `PipelineBehaviorOrder`, `PipelineBehaviorOrderRule` | Types | A behavior contract and its ordering rules |
| `toPostgresJson` | Function | Replaces the NUL characters and lone surrogates that PostgreSQL `jsonb` rejects in JSON text with U+FFFD; used by the Postgres audit sink and dead-letter transport |

The serializers and key-segment helpers (`stableStringify`, `safeStringify`, …) come from
[`@cqrs-ddd/safe-stringify`](https://github.com/aristoteliss/nestjs-pipeline/tree/master/packages/safe-stringify),
and `uuidv7` from `@cqrs-ddd/uuidv7`; import them from there.


**`PipelineModuleOptions` fields:**

| Field | Type | Description |
|---|---|---|
| `behaviors` | `Type[]` | Behavior classes to register in DI; registration alone does not execute them globally |
| `globalBehaviors` | `GlobalBehaviorsOptions \| GlobalBehaviorsOptions[]` | Auto-wrap matching handlers |
| `diagnostics` | `'strict' \| 'warn' \| 'off'` | Bootstrap behavior contract verification mode (default `'strict'`) |
| `bootstrapLogLevel` | `LogLevel \| 'none'` | Log level for bootstrap messages (default `'debug'`) |
| `loggerProvider` | `PipelineLoggerProvider` | Custom DI provider whose `provide` token must be `LOGGING_BEHAVIOR_LOGGER` (registered and exported) |
| `sources` | `ContextSources` | Where pipelines take their tenant and correlation ID from, such as `tenantSource` and `correlationSource` |

---

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
