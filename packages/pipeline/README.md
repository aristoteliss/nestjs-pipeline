# @nestjs-pipeline/core

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/core.svg)](https://www.npmjs.com/package/@nestjs-pipeline/core)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/core.svg)](https://www.npmjs.com/package/@nestjs-pipeline/core)

Pipeline behaviors for **NestJS CQRS** — wrap every command, query, and event handler with reusable cross-cutting concerns using a clean middleware-like chain.

No additional runtime dependencies beyond NestJS itself. Works with Express and Fastify.

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
- [Built-in LoggingBehavior](#built-in-loggingbehavior)
- [Correlation IDs](#correlation-ids)
  - [HTTP Requests](#http-requests)
  - [Non-HTTP Entry Points](#non-http-entry-points)
  - [@WithCorrelation Decorator](#withcorrelation-decorator)
  - [Producer-Side Utilities](#producer-side-utilities)
  - [Reading the Current Correlation ID](#reading-the-current-correlation-id)
  - [Nested Commands and Sagas](#nested-commands-and-sagas)
- [Execution Model](#execution-model)
- [API Reference](#api-reference)
- [License](#license)

---

## Installation

```bash
pnpm add @nestjs-pipeline/core
```

**Peer dependencies** (must be installed in your application):

```bash
pnpm add @nestjs/common @nestjs/core @nestjs/cqrs reflect-metadata rxjs
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
    }),
  ],
})
export class AppModule {}

// ── Style 2: Simple array (backward-compatible) ──

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot([LoggingBehavior, AuditBehavior]),
  ],
})
export class AppModule {}

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

Register behaviors owned by a specific feature module:

```typescript
import { Module } from '@nestjs/common';
import { PipelineModule } from '@nestjs-pipeline/core';

@Module({
  imports: [PipelineModule.forFeature([AuditBehavior, CachingBehavior])],
})
export class AuditModule {}
```

This makes `AuditBehavior` and `CachingBehavior` available for `@UsePipeline()` references within that module hierarchy.

---

## The @UsePipeline Decorator

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

// Tuple form — pass options to specific behaviors
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
| `correlationId` | `string` | Mutable correlation ID — behaviors may override it |
| `originalCorrelationId` | `string` | Immutable snapshot of the initial correlation ID |
| `request` | `TRequest` | The command / query / event instance |
| `requestType` | `Type<TRequest>` | Class constructor (e.g. `CreateUserCommand`) |
| `requestName` | `string` | Class name string (e.g. `"CreateUserCommand"`) |
| `handlerType` | `Type` | Handler class constructor |
| `handlerName` | `string` | Handler class name (e.g. `"CreateUserHandler"`) |
| `requestKind` | `'command' \| 'query' \| 'event' \| 'unknown'` | Auto-detected from `@nestjs/cqrs` metadata |
| `startedAt` | `Date` | UTC timestamp of pipeline start |
| `response` | `TResponse \| undefined` | Set after `next()` returns; `undefined` before the handler runs |
| `items` | `Map<string, any>` | Shared bag for inter-behavior communication |

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

Options set at the global level via `globalBehaviors` are merged with handler-level options. Handler-level options win on conflict.

### Inter-Behavior Communication

Use `context.items` to pass data between behaviors in the same pipeline execution:

```typescript
// AuthBehavior (runs first)
async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
  const userId = await this.authService.getCurrentUserId();
  context.items.set('currentUserId', userId);
  return next();
}

// AuditBehavior (runs later in the chain)
async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
  const result = await next();
  const userId = context.items.get('currentUserId');
  await this.auditService.log({ userId, action: context.requestName });
  return result;
}
```

---

## Global Behaviors

### Scoping

Global behaviors can be scoped to specific handler kinds:

```typescript
// All handler kinds
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

When the same behavior class appears in both global and handler-level configurations, the **handler-level entry wins** (including its options). The duplicate global entry is removed:

```typescript
// Global: LoggingBehavior with default options
PipelineModule.forRoot({
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
})

// Handler: LoggingBehavior with custom options → global entry is dropped
@CommandHandler(CreateUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class CreateUserHandler { /* ... */ }

// Effective chain: [LoggingBehavior (handler opts)] → handler
```

---

## Built-in LoggingBehavior

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

```typescript
// Override options per handler
@CommandHandler(CreateUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class CreateUserHandler { /* ... */ }

// Disable payload logging, keep metrics
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'none' }])

// Silence all logging
@UsePipeline([LoggingBehavior, { metricLogLevel: 'none', requestResponseLogLevel: 'none' }])
```

**Output** (success):

```
[LoggingBehavior] Request: {"username":"jane","email":"jane@example.com"}
[LoggingBehavior] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler completed in 12.34ms
[LoggingBehavior] Response: {"id":"...","username":"jane"}
```

**Output** (error):

```
[LoggingBehavior] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler failed after 2.10ms: Error: User already exists
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
3. For each handler with `@UsePipeline` or matching global behaviors: pre-resolves behavior instances, builds metadata, wraps the `execute()` / `handle()` method.
4. Everything is computed once at startup — zero reflection or DI lookups at request time.
5. Supports singleton and request-scoped handlers (`Scope.REQUEST`, `Scope.TRANSIENT`).

---

## API Reference

### Exports

| Export | Type | Description |
|---|---|---|
| `PipelineModule` | Module | `.forRoot()` and `.forFeature()` registration |
| `UsePipeline` | Decorator | Attach behaviors to CQRS handlers |
| `IPipelineBehavior` | Interface | Behavior contract: `handle(context, next)` |
| `IPipelineContext` | Interface | Rich execution context |
| `NextDelegate` | Type | `() => Promise<TResponse>` |
| `BasePipelineContext` | Class | Extensible base — override if you need custom contexts |
| `PipelineContext` | Class | Concrete context created per invocation |
| `LoggingBehavior` | Class | Built-in structured logging |
| `LoggingBehaviorOptions` | Interface | Options for `LoggingBehavior` (`metricLogLevel`, `requestResponseLogLevel`) |
| `uuidv7` | Function | Generate timestamp-sortable UUIDs |
| `pipelineStore` | `AsyncLocalStorage` | Access the current pipeline context |
| `PipelineModuleOptions` | Interface | Options for `PipelineModule.forRoot()` |
| `GlobalBehaviorsOptions` | Interface | Global behavior configuration |
| `GlobalBehaviorScope` | Type | `'commands' \| 'queries' \| 'events' \| 'all'` |
| `PIPELINE_MODULE_OPTIONS` | Symbol | DI token for module options |
| `PipelineBootstrapService` | Class | Scans and wraps handlers at bootstrap |
| `PipelineHandlerMeta` | Interface | Pre-computed handler metadata |
| `PIPELINE_BEHAVIOR_ID` | Symbol | Custom deduplication key for behaviors |
| `PipelineBehaviorEntry` | Type | `Type \| [Type, Record<string, any>]` |

**`PipelineModuleOptions` fields:**

| Field | Type | Description |
|---|---|---|
| `behaviors` | `Type[]` | Behavior classes to register in DI |
| `globalBehaviors` | `GlobalBehaviorsOptions` | Auto-wrap all handlers |
| `correlationIdFactory` | `() => string \| undefined` | Read the current correlation ID (e.g. `getCorrelationId`) |
| `correlationIdRunner` | `<T>(id: string, fn: () => T) => T` | Wrap each pipeline invocation in a correlation context (e.g. `runWithCorrelationId`) |
| `bootstrapLogLevel` | `LogLevel \| 'none'` | Log level for bootstrap messages (default `'debug'`) |

---

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](../../LICENSE) and [`COMMERCIAL_LICENSE.txt`](../../COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
