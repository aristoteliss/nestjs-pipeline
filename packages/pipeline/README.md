# @nestjs-pipeline/core

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/core.svg)](https://www.npmjs.com/package/@nestjs-pipeline/core)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/core.svg)](https://www.npmjs.com/package/@nestjs-pipeline/core)

Pipeline behaviors for **NestJS CQRS** — wrap every command, query, and event handler with reusable cross-cutting concerns using a clean middleware-like chain.

Its peer contract also includes the standard NestJS runtime peers
`reflect-metadata` and `rxjs`. Works with Express and Fastify.

---

## Table of Contents

- [Installation](#installation)
- [Module Registration](#module-registration)
  - [forRoot()](#forroot)
  - [forFeature()](#forfeature)
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
- [Correlation IDs](#correlation-ids)
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

**Peer dependencies** (must be installed in your application). Nest and
`@nestjs/cqrs` must both be version 11 — Nest 10 is not supported, because
request-scoped and transient handlers are resolved through `AsyncContext`,
which `@nestjs/cqrs` only exposes from version 11:

```bash
pnpm add @nestjs/common @nestjs/core @nestjs/cqrs reflect-metadata rxjs

# Optional: use pino as Nest logger
pnpm add nestjs-pino pino-http pino-pretty
```

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
      // Bridge correlation IDs from @nestjs-pipeline/correlation (optional)
      // correlationIdFactory: getCorrelationId,
      // correlationIdRunner: runWithCorrelationId,
      // Eagerly resolve tenant ID per pipeline execution (optional)
      // tenantIdFactory: () => TenantContext.currentTenant,
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

// ── Style 3: With correlation ID bridge ──

import { getCorrelationId, runWithCorrelationId } from '@nestjs-pipeline/correlation';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      behaviors: [LoggingBehavior],
      correlationIdFactory: getCorrelationId,
      correlationIdRunner: runWithCorrelationId,
    }),
  ],
})
export class AppModule {}
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
  imports: [PersistenceModule],
  inject: [TenantSchemaContext],

  // Provider graph — evaluated before the factory.
  behaviors: [LoggingBehavior, ZodValidationBehavior],
  loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: MyLogger },

  // Runtime configuration — resolved from injected providers.
  useFactory: (tenant: TenantSchemaContext) => ({
    tenantIdFactory: () => tenant.schema,
    globalBehaviors: [{ scope: 'all', before: [LoggingBehavior] }],
  }),
});
```

Returning either field from the factory raises a `TypeError` at bootstrap. It
used to be dropped in silence, so an application that moved its behavior list
into the factory started cleanly with every `@UsePipeline` reference
unresolvable and failed on the first request instead.

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
  idempotent({ keyFactory: (ctx) => ctx.request.idempotencyKey }),
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
| `tenantId` | `string \| undefined` | Active tenant identifier (inherited from parent context or resolved via `tenantIdFactory`) |
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

When the same behavior class appears in both global and handler-level
configurations, the handler's complete options record wins while the behavior
retains its global chain position. Global duplicates are deduplicated:

```typescript
// Global: LoggingBehavior with default options
PipelineModule.forRoot({
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
})

// Handler: overrides options without relocating the global behavior
@CommandHandler(CreateUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class CreateUserHandler { /* ... */ }

// Effective chain: [LoggingBehavior at global-before position (handler opts)] → handler
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
| `excludeRequestObj` | `boolean` | `true` | If true, omits the request object from logs entirely (shows placeholder instead) |
| `excludeResponseObj` | `boolean` | `true` | If true, omits the response object from logs entirely (shows placeholder instead) |
| `logFormat` | `'text' \| 'structured'` | `'text'` | Output shape for request/response/metric/error logs. `'text'` emits a single interpolated string; `'structured'` emits a plain object payload (e.g. `{ msg, request }` for request/response, `{ message, stack, ... }` for errors) — suitable for structured loggers like `nestjs-pino`/pino that serialize objects into JSON fields |

When the wrapped handler throws, the logged error entry is also enriched with:
- the error's `stack`, if it's an `Error` instance;
- the error's `optionalParams`, if the thrown value defines one — normalized into an array and merged into the logged payload, so any extra context an exception carries beyond `message`/`stack` still reaches the logs.

The original error is always re-thrown unchanged after logging, so `LoggingBehavior` only observes failures — it never swallows them.

Provide your own logger by binding `LOGGING_BEHAVIOR_LOGGER` (for example with `nestjs-pino`):

```typescript
import { Module } from '@nestjs/common';
import { NativeLogger } from 'nestjs-pino';
import {
  LOGGING_BEHAVIOR_LOGGER,
  LoggingBehavior,
  PipelineModule,
} from '@nestjs-pipeline/core';

@Module({
  imports: [
    PipelineModule.forRoot({
      globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
      bootstrapLogLevel: 'verbose',
    }),
  ],
  providers: [
    { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: NativeLogger },
  ],
})
export class AppModule {}
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

## Correlation IDs

Every pipeline invocation carries a `correlationId` for distributed tracing, resolved in priority order:

1. **Parent pipeline** — inherited from `AsyncLocalStorage` (saga / nested command)
2. **`correlationIdFactory`** — user-supplied factory from module options
3. **`uuidv7()`** — timestamp-sortable UUID fallback

The pipeline core generates its own `uuidv7()` IDs by default. To bridge external correlation IDs (HTTP headers, message queues, etc.), install [`@nestjs-pipeline/correlation`](../pipeline-correlation) and pass `getCorrelationId` + `runWithCorrelationId`:

```typescript
import { getCorrelationId, runWithCorrelationId } from '@nestjs-pipeline/correlation';

PipelineModule.forRoot({
  correlationIdFactory: getCorrelationId,
  correlationIdRunner: runWithCorrelationId,
  // ...
})
```

`correlationIdFactory` **reads** the current correlation ID (e.g. set by HTTP middleware or `@WithCorrelation`).  
`correlationIdRunner` **writes** the pipeline's resolved correlation ID back into the correlation store so that `getCorrelationId()` returns it throughout the entire handler chain — including event handlers dispatched via `eventBus.publish()`.

The resolved ID is immutable during execution. This keeps
`context.correlationId`, nested pipeline inheritance, and the configured
correlation store on one value.

Or supply any custom factory/runner:

```typescript
PipelineModule.forRoot({
  correlationIdFactory: () => myCustomIdSource(),
  correlationIdRunner: (id, fn) => myCustomRunner(id, fn),
})
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
import { runWithCorrelationId, uuidv7 } from '@nestjs-pipeline/correlation';

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
2. Discovers all CQRS handlers via `@nestjs/cqrs` `ExplorerService` (commands, queries, events).
3. For each handler with `@UsePipeline` or matching global behaviors: computes effective behavior/handler metadata, resolves singleton behavior instances, and wraps the `execute()` / `handle()` method. Behaviors that cannot be resolved as singletons are marked for dynamic resolution.
4. Request-independent metadata is computed once at startup. The common all-singleton path reuses pre-resolved behavior instances with no per-request reflection/behavior DI lookup; request-scoped/transient behaviors are resolved per invocation with `moduleRef.resolve()` and the applicable Nest context ID.
5. Requires Nest and Nest CQRS 11. Request-scoped and transient handlers
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
ownership: it uses the sole registered chain when unambiguous, or logs a warning
and runs the original method when several applications share its prototype.

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
| `PipelineModule` | Module | `.forRoot()` and `.forFeature()` registration |
| `UsePipeline` | Decorator | Attach behaviors to CQRS handlers |
| `SkipPipeline` | Decorator | Exclude global behaviors from a specific CQRS handler |
| `IPipelineBehavior` | Interface | Behavior contract: `handle(context, next)` |
| `IPipelineContext` | Interface | Rich execution context |
| `NextDelegate` | Type | `() => Promise<TResponse>` |
| `BasePipelineContext` | Class | Extensible base — override if you need custom contexts |
| `PipelineContext` | Class | Concrete context created per invocation |
| `LoggingBehavior` | Class | Built-in structured logging |
| `LoggingBehaviorOptions` | Interface | Options for `LoggingBehavior` (`metricLogLevel`, `requestResponseLogLevel`, `errorLogLevel`, `mapLogLevel`, `excludeKeys`, `excludeRequestObj`, `excludeResponseObj`, `logFormat`) |
| `logging` | Function | Typed intent builder returning `[LoggingBehavior, options]` for `@UsePipeline` |
| `LoggingIntentOptions` | Type | Alias for `LoggingBehaviorOptions` |
| `uuidv7` | Function | Generate timestamp-sortable UUIDs |
| `pipelineStore` | `AsyncLocalStorage` | Access the current pipeline context |
| `PipelineModuleOptions` | Interface | Options for `PipelineModule.forRoot()` |
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
| `PipelineBehaviorValidationContext` | Interface | Handler and option inspection context supplied to contract validators |
| `PIPELINE_SKIPPED_BEHAVIORS_METADATA` | Symbol | Metadata key for skipped behavior classes |
| `SET_TENANT_ID` | Symbol | Symbol setter for `tenantId` |
| `PipelineBehaviorEntry` | Type | `Type \| [Type, Record<string, unknown>]` |
| `stableStringify` | Function | Deterministic JSON serialization with sorted keys and cycle detection |
| `toStrictJsonValue` | Function | Normalizes arbitrary values into strictly typed JSON domain |
| `StrictJsonValue` | Type | Strict JSON-compatible recursive type definition |
| `safeSanitize` | Function | Deeply redacts sensitive keys and strips unsupported types |


**`PipelineModuleOptions` fields:**

| Field | Type | Description |
|---|---|---|
| `behaviors` | `Type[]` | Behavior classes to register in DI; registration alone does not execute them globally |
| `globalBehaviors` | `GlobalBehaviorsOptions \| GlobalBehaviorsOptions[]` | Auto-wrap matching handlers |
| `diagnostics` | `'strict' \| 'warn' \| 'off'` | Bootstrap behavior contract verification mode (default `'strict'`) |
| `correlationIdFactory` | `() => string \| undefined` | Read an external correlation ID for a root run after parent inheritance is checked (e.g. `getCorrelationId`) |
| `correlationIdRunner` | `<T>(id: string, fn: () => T) => T` | Wrap each pipeline invocation in a correlation context (e.g. `runWithCorrelationId`) |
| `tenantIdFactory` | `() => string \| undefined` | Eagerly resolve tenant ID per pipeline execution (e.g. from async storage context) |
| `bootstrapLogLevel` | `LogLevel \| 'none'` | Log level for bootstrap messages (default `'debug'`) |
| `loggerProvider` | `PipelineLoggerProvider` | Custom DI provider whose `provide` token must be `LOGGING_BEHAVIOR_LOGGER` (registered and exported) |

---

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](../../LICENSE) and [`COMMERCIAL_LICENSE.txt`](../../COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
