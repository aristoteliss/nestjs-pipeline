# nestjs-pipeline

Pipeline behaviors for **NestJS CQRS** — wrap every command, query, and event handler with reusable cross-cutting concerns (logging, validation, tracing, audit, …) using a clean middleware-like chain.

```
HTTP Request
  → Controller (ZodPipe validation)
  → CommandBus / QueryBus / EventBus
  → Pipeline chain:
      [global before] → [@UsePipeline behaviors] → [global after] → handler
```

> **Same-class override:** if a handler's `@UsePipeline` declares the same
> behavior class as a global `before`/`after` entry, the behavior runs **once at
> its global chain position**, using the handler's options. Preserving position
> keeps global security guards outside cache/idempotency behaviors that may
> short-circuit without calling `next()`.
>
> Global type-level guards do not replace entity checks or field filtering
> performed inside a handler. Because cache/idempotency hits skip that handler,
> their keys must include the relevant tenant, principal, and permission scope
> whenever results depend on those checks.

The core package adds no runtime dependencies beyond NestJS itself. Add-on packages
use their own declared integrations (Zod, OpenTelemetry, CASL, OpenFeature, etc.).
Works with Express and Fastify.

---

## Table of Contents

- [Packages](#packages)
- [Quick Start](#quick-start)
  - [1  Install](#1-install)
  - [2  Register the Module](#2-register-the-module)
  - [3  Define a Command with Zod Validation](#3-define-a-command-with-zod-validation)
  - [4  Write the Handler](#4-write-the-handler)
  - [5  Wire Up the Controller](#5-wire-up-the-controller)
  - [6  Bootstrap the Application](#6-bootstrap-the-application)
- [Writing Custom Behaviors](#writing-custom-behaviors)
  - [Example: Metrics Behavior](#example-metrics-behavior)
  - [Example: Audit-Trail Behavior with Options](#example-audit-trail-behavior-with-options)
  - [Example: Caching Behavior](#example-caching-behavior)
  - [Example: Retry Behavior](#example-retry-behavior)
  - [Registering Behaviors](#registering-behaviors)
- [Pipeline Execution Model](#pipeline-execution-model)
  - [Execution Order](#execution-order)
  - [Deduplication](#deduplication)
- [Correlation IDs](#correlation-ids)
  - [HTTP Requests](#http-requests)
  - [Bull Queue Processor](#bull-queue-processor)
  - [RabbitMQ Handler](#rabbitmq-handler)
  - [Cron Jobs](#cron-jobs)
  - [Nested Commands (Sagas)](#nested-commands-sagas)
  - [@WithCorrelation Decorator](#withcorrelation-decorator)
  - [Producer-Side: Stamping Correlation IDs](#producer-side-stamping-correlation-ids)
- [Pipeline Context Reference](#pipeline-context-reference)
  - [Properties](#properties)
  - [Using items for Inter-Behavior Communication](#using-items-for-inter-behavior-communication)
  - [Behavior Options](#behavior-options)
- [Built-in LoggingBehavior](#built-in-loggingbehavior)
- [Zod Integration](#zod-integration-nestjs-pipelinezod)
  - [Pipeline-Level Validation](#pipeline-level-validation)
  - [Controller-Level Validation with ZodPipe](#controller-level-validation-with-zodpipe)
  - [Zod Transform Mappers (DTO → Command)](#zod-transform-mappers-dto--command)
  - [Error Handling with ZodValidationFilter](#error-handling-with-zodvalidationfilter)
  - [Attaching Schemas to Plain Event Classes](#attaching-schemas-to-plain-event-classes)
- [OpenTelemetry Integration](#opentelemetry-integration-nestjs-pipelineopentelemetry)
  - [Setup](#setup)
  - [Span Details](#span-details)
  - [No SDK? No Problem.](#no-sdk-no-problem)
- [DDD Example](#ddd-example)
- [Repository Structure](#repository-structure)
- [Development](#development)
- [Adding a New Behavior Package](#adding-a-new-behavior-package)
- [License and Commercial Use](#license-and-commercial-use)

---

## Packages

| Package | Description |
|---|---|
| [`@nestjs-pipeline/core`](packages/pipeline) | Pipeline engine, `@UsePipeline` decorator, `PipelineModule`, `LoggingBehavior` |
| [`@nestjs-pipeline/correlation`](packages/pipeline-correlation) | Standalone correlation ID propagation — HTTP middleware, `@WithCorrelation`, `runWithCorrelationId`, `getCorrelationId` |
| [`@nestjs-pipeline/zod`](packages/pipeline-zod) | Zod v4 validation/parsing behavior that applies successful parsed object output to the request, plus `ZodPipe`, `ZodValidationFilter`, `ZodValidationError` |
| [`@nestjs-pipeline/opentelemetry`](packages/pipeline-opentelemetry) | OpenTelemetry tracing & metrics behaviors — spans plus duration/throughput/error instruments for every pipeline invocation |
| [`@nestjs-pipeline/casl`](packages/pipeline-casl) | CASL ABAC authorization behavior — role-based capability trees, condition interpolation, inline `rules` on `CaslBehaviorOptions` |
| [`@nestjs-pipeline/resilience`](packages/pipeline-resilience) | Resilience & transient-fault-handling behavior — retry, circuit breaker, timeout, bulkhead, fallback (powered by cockatiel) |
| [`@nestjs-pipeline/cache`](packages/pipeline-cache) | Read-through caching behavior for queries — pluggable stores (memory, redis, memcache, sqlite, postgres) via cache-manager v7 on keyv |
| [`@nestjs-pipeline/feature-flags`](packages/pipeline-feature-flags) | Feature-flag gating behavior — provider-agnostic via OpenFeature (Unleash shown in examples; Flagsmith/LaunchDarkly are drop-in alternatives) |
| [`@nestjs-pipeline/deadletter`](packages/pipeline-deadletter) | Dead-letter capture-attempt behavior for failed requests — transport-agnostic with bundled BullMQ, RabbitMQ, and Postgres transports |
| [`@nestjs-pipeline/rate-limit`](packages/pipeline-rate-limit) | Rate-limiting behavior — backend-agnostic via rate-limiter-flexible (memory, Redis/Valkey, Mongo, SQL), HTTP 429 filter |
| [`@nestjs-pipeline/audit`](packages/pipeline-audit) | Audit-trail behavior — records who/what/outcome/duration to a pluggable `AuditSink` (console default, Postgres drop-in), with payload redaction |
| [`@nestjs-pipeline/idempotency`](packages/pipeline-idempotency) | Idempotency behavior — atomic concurrent duplicate exclusion and successful-response replay per key; failed executions are retryable by default, via a pluggable store (in-memory default, Redis/Postgres drop-in) |

> Add-on packages live in `packages/pipeline-<name>/` and peer-depend on `@nestjs-pipeline/core`.

### Current Package Versions

| Package | Version |
|---|---|
| `@nestjs-pipeline/core` | `0.1.19` |
| `@nestjs-pipeline/correlation` | `0.1.9` |
| `@nestjs-pipeline/zod` | `0.1.7` |
| `@nestjs-pipeline/opentelemetry` | `0.1.9` |
| `@nestjs-pipeline/casl` | `0.1.2` |
| `@nestjs-pipeline/resilience` | `0.1.0` |
| `@nestjs-pipeline/cache` | `0.1.0` |
| `@nestjs-pipeline/feature-flags` | `0.1.0` |
| `@nestjs-pipeline/deadletter` | `0.1.0` |
| `@nestjs-pipeline/rate-limit` | `0.1.0` |
| `@nestjs-pipeline/audit` | `0.1.0` |
| `@nestjs-pipeline/idempotency` | `0.1.0` |

---

## Quick Start

### 1. Install

```bash
pnpm add @nestjs-pipeline/core @nestjs/common @nestjs/core @nestjs/cqrs reflect-metadata rxjs

# Optional add-ons
pnpm add @nestjs-pipeline/correlation   # HTTP correlation middleware, @WithCorrelation, etc.
pnpm add @nestjs-pipeline/zod zod
pnpm add @nestjs-pipeline/opentelemetry @opentelemetry/api
pnpm add @nestjs-pipeline/casl @casl/ability      # ABAC authorization with CASL
pnpm add @nestjs-pipeline/resilience cockatiel    # retry, circuit breaker, timeout, bulkhead, fallback
pnpm add @nestjs-pipeline/cache cache-manager keyv  # read-through query caching (+ optional @keyv/redis, @keyv/postgres, ...)
pnpm add @nestjs-pipeline/deadletter bullmq        # dead-letter failed requests (or amqplib / pg as a drop-in)
pnpm add @nestjs-pipeline/rate-limit rate-limiter-flexible  # rate limiting (memory, Redis/Valkey, Mongo, SQL backends)
pnpm add @nestjs-pipeline/audit   # audit trail (console default; + optional pg for Postgres)
pnpm add @nestjs-pipeline/idempotency   # idempotent commands (in-memory default; + optional redis/pg)
pnpm add @nestjs-pipeline/feature-flags @openfeature/server-sdk  # feature flags (provider adapters optional)

# Optional: pino logger integration
pnpm add nestjs-pino pino-http pino-pretty
```

### 2. Register the Module

```typescript
// app.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule, LoggingBehavior } from '@nestjs-pipeline/core';
import { getCorrelationId, runWithCorrelationId, HttpCorrelationMiddleware } from '@nestjs-pipeline/correlation';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';
import { TraceBehavior } from '@nestjs-pipeline/opentelemetry';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      // Bridge correlation IDs from @nestjs-pipeline/correlation into the pipeline
      correlationIdFactory: getCorrelationId,
      correlationIdRunner: runWithCorrelationId,
      // Eagerly resolve tenant ID per pipeline execution (optional)
      // tenantIdFactory: () => TenantContext.currentTenant,
      globalBehaviors: {
        scope: 'all',                // 'commands' | 'queries' | 'events' | 'all'
        before: [
          LoggingBehavior,          // outermost; may observe raw input
          ZodValidationBehavior,     // normalizes before handler policies
        ],
        after: [                     // runs closest to the handler
          [TraceBehavior, { tracerName: 'my-service' }],
        ],
      },
    }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}
```

### 3. Define a Command with Zod Validation

```typescript
// create-user.command.ts
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

// 1. Define the schema
const schema = z.object({
  username: z.string().min(4),
  email: z.string().email(),
});

// 2. Create the command — fully typed, self-validating, Standard Schema compatible
export class CreateUserCommand extends createCommand(schema) {}

// Usage:
// const cmd = new CreateUserCommand({ username: 'jane', email: 'jane@example.com' });
// cmd.username → 'jane'
// cmd.email    → 'jane@example.com'
// new CreateUserCommand({ username: 'ab', email: 'bad' }) → throws ZodValidationError
```

### 4. Write the Handler

```typescript
// create-user.handler.ts
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline, LoggingBehavior } from '@nestjs-pipeline/core';
import { CreateUserCommand } from './create-user.command';

@CommandHandler(CreateUserCommand)
@UsePipeline(
  // Override global LoggingBehavior options for this handler only
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateUserCommand): Promise<User> {
    const user = User.create(command.username, command.email);
    this.userRepository.save(user);

    this.eventBus.publish(
      new UserCreatedEvent({
        userId: user.id,
        username: user.username,
        email: user.email,
      }),
    );

    return user;
  }
}
```

This constructor helper is intentionally synchronous and therefore requires a
synchronous schema. If the schema uses async refinements or transforms, validate
with `safeParseAsync()` in `ZodValidationBehavior`/`ZodPipe` instead of doing it
in a JavaScript constructor.

### 5. Wire Up the Controller

```typescript
// users.controller.ts
import { Body, Controller, Get, Param, Post, HttpCode } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ZodPipe } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const CreateUserDtoSchema = z.object({ name: z.string().min(5), email: z.email() });
type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

const UserIdSchema = z.string().uuid();

@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(201)
  async createUser(
    @Body(new ZodPipe(CreateUserDtoSchema)) dto: CreateUserDto,
  ) {
    return this.commandBus.execute(
      new CreateUserCommand({ username: dto.name, email: dto.email }),
    );
  }

  @Get(':id')
  async getUser(
    @Param('id', new ZodPipe(UserIdSchema)) id: string,
  ) {
    return this.queryBus.execute(new GetUserQuery({ userId: id }));
  }
}
```

### 6. Bootstrap the Application

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ZodValidationFilter()); // maps ZodValidationError → HTTP 400
  await app.listen(3000);
}
bootstrap();
```

---

## Writing Custom Behaviors

Every behavior implements the `IPipelineBehavior` interface — a single `handle(context, next)` method:

```typescript
import { Injectable } from '@nestjs/common';
import {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@nestjs-pipeline/core';

@Injectable()
export class MyBehavior implements IPipelineBehavior {
  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<any> {
    // ── BEFORE the handler ──
    // Access context.request, context.correlationId, context.requestKind, etc.

    const result = await next(); // call the next behavior in the chain (or the handler)

    // ── AFTER the handler ──
    // Access context.response (set automatically after the handler returns)

    return result;
  }
}
```

### Example: Metrics Behavior

> **Tip:** A production-ready metrics behavior already ships in [`@nestjs-pipeline/opentelemetry`](packages/pipeline-opentelemetry) (`MetricsBehavior`, built on the OTel Metrics API). The example below is a from-scratch illustration for any custom metrics backend.

```typescript
import { Injectable } from '@nestjs/common';
import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

@Injectable()
export class MetricsBehavior implements IPipelineBehavior {
  constructor(private readonly metricsService: MetricsService) {}

  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const start = performance.now();
    const labels = {
      kind: context.requestKind,     // 'command' | 'query' | 'event'
      name: context.requestName,     // 'CreateUserCommand'
      handler: context.handlerName,  // 'CreateUserHandler'
    };

    try {
      const result = await next();
      const durationMs = performance.now() - start;
      this.metricsService.recordDuration('pipeline.duration_ms', durationMs, labels);
      this.metricsService.incrementCounter('pipeline.success', labels);
      return result;
    } catch (error) {
      const durationMs = performance.now() - start;
      this.metricsService.recordDuration('pipeline.duration_ms', durationMs, labels);
      this.metricsService.incrementCounter('pipeline.failure', labels);
      throw error;
    }
  }
}
```

### Example: Audit-Trail Behavior with Options

Pass per-handler options via the `[Behavior, { ... }]` tuple form and read them with `getBehaviorOptions()`:

```typescript
// audit.behavior.ts
import { Injectable } from '@nestjs/common';
import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

export interface AuditOptions {
  action: string;
  severity?: 'low' | 'medium' | 'high';
}

@Injectable()
export class AuditBehavior implements IPipelineBehavior {
  constructor(private readonly auditService: AuditService) {}

  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const result = await next();

    // Read handler-specific options from @UsePipeline([AuditBehavior, { ... }])
    const opts = context.getBehaviorOptions<AuditOptions>(AuditBehavior);
    if (opts) {
      await this.auditService.log({
        action: opts.action,
        severity: opts.severity ?? 'medium',
        correlationId: context.correlationId,
        requestKind: context.requestKind,
        requestName: context.requestName,
        handler: context.handlerName,
        timestamp: context.startedAt,
        payload: context.request,
      });
    }

    return result;
  }
}

// create-user.handler.ts — handler-level options
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [AuditBehavior, { action: 'user.create', severity: 'high' }],
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand): Promise<User> { /* ... */ }
}

// delete-order.handler.ts — different options for a different handler
@CommandHandler(DeleteOrderCommand)
@UsePipeline(
  [AuditBehavior, { action: 'order.delete', severity: 'high' }],
)
export class DeleteOrderHandler implements ICommandHandler<DeleteOrderCommand> {
  async execute(command: DeleteOrderCommand): Promise<void> { /* ... */ }
}
```

### Example: Caching Behavior

```typescript
import { Injectable } from '@nestjs/common';
import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

@Injectable()
export class CachingBehavior implements IPipelineBehavior {
  constructor(private readonly cache: CacheService) {}

  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    // Only cache queries — commands and events always execute
    if (context.requestKind !== 'query') {
      return next();
    }

    const cacheKey = `${context.requestName}:${JSON.stringify(context.request)}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await next();
    await this.cache.set(cacheKey, result, { ttl: 60 });
    return result;
  }
}
```

### Example: Retry Behavior

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

@Injectable()
export class RetryBehavior implements IPipelineBehavior {
  private readonly logger = new Logger(RetryBehavior.name);

  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const maxRetries = 3;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await next();
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `[${context.correlationId}] ${context.requestName} ` +
          `attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
        );
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 100 * attempt));
        }
      }
    }

    throw lastError!;
  }
}
```

### Registering Behaviors

```typescript
// ── Global: auto-wraps all commands, queries, and events ──
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [MetricsBehavior, LoggingBehavior, ZodValidationBehavior],
  },
})

// ── Scoped global: only commands ──
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'commands',
    before: [AuditBehavior],
  },
})

// ── Per-kind scoping with array form ──
PipelineModule.forRoot({
  globalBehaviors: [
    { scope: 'commands', before: [AuditBehavior] },
    { scope: 'queries',  before: [CachingBehavior] },
    { scope: 'all',      after:  [LoggingBehavior] },
  ],
})

// ── Per-handler: override or add behaviors for specific handlers ──
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [AuditBehavior, { action: 'user.create' }],
)
export class CreateUserHandler { /* ... */ }

// ── Feature module: register feature-owned behaviors application-wide ──
@Module({
  imports: [PipelineModule.forFeature([AuditBehavior, CachingBehavior])],
})
export class AuditModule {}
```

`PipelineModule` is global, so `forFeature()` records where behavior providers
are owned but does not isolate them to that feature's module hierarchy. Once the
feature is imported, the registered behaviors are discoverable by
`@UsePipeline()` throughout the application.

---

## Pipeline Execution Model

```
┌─ global before ──┐   ┌── @UsePipeline ──┐   ┌─ global after ──┐
│ LoggingBehavior  │ → │ AuditBehavior    │ → │ TraceBehavior   │ → handler.execute()
│ MetricsBehavior  │   │                  │   │ ZodValidation   │
└──────────────────┘   └──────────────────┘   └─────────────────┘
                    ← response propagates back through the chain ←
```

1. **`PipelineBootstrapService`** scans all CQRS handlers at startup via `@nestjs/cqrs` `ExplorerService`.
2. For each matching handler it precomputes request-independent metadata and resolves singleton behavior instances. Behaviors that cannot be resolved as singletons are marked for per-invocation resolution.
3. Per invocation: creates a `PipelineContext`, resolves any dynamic/request-scoped/transient behaviors with the applicable Nest context ID, resolves correlation ID, and runs the chain inside `AsyncLocalStorage` for nested propagation.
4. The common all-singleton path reuses the pre-resolved instances with no request-time reflection or behavior DI lookup; scoped/dynamic behaviors intentionally use request-time DI resolution.
5. Supports **singleton** handlers on Nest CQRS 10. Request-scoped/transient
   handlers (`Scope.REQUEST`, `Scope.TRANSIENT`) require Nest CQRS 11+.

### Execution Order

| Phase | Source | Position |
|---|---|---|
| Global `before` | `globalBehaviors.before` | Outermost (first to run) |
| Handler-level | `@UsePipeline(...)` | Middle |
| Global `after` | `globalBehaviors.after` | Innermost (closest to handler) |
| Handler | `execute()` / `handle()` | Core |

### Deduplication

When both global and handler-level configurations include the same behavior
class, the handler's complete options record wins while the behavior retains
its global chain position. Global duplicates are deduplicated automatically.

```typescript
// Global config
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [LoggingBehavior], // default options: metricLogLevel='log', requestResponseLogLevel='debug'
  },
})

// Handler overrides LoggingBehavior's options
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }], // ← wins over the global entry
)
export class CreateUserHandler { /* ... */ }

// Effective chain for CreateUserHandler:
//   [LoggingBehavior at global-before position, using handler opts] → handler
```

Configure mandatory authentication/authorization behaviors in global `before`.
Core preserves that outer position even when a handler redeclares the behavior
to provide rules or other options, preventing inner cache/idempotency hits from
bypassing the guard.

---

## Correlation IDs

Every pipeline invocation carries a `correlationId` resolved in priority order:

1. **Parent pipeline** — if a saga or nested `CommandBus.execute()` triggers a child, it inherits the parent's ID via `AsyncLocalStorage`.
2. **`correlationIdFactory`** — user-supplied factory from `PipelineModule.forRoot()` options (e.g. `getCorrelationId` from `@nestjs-pipeline/correlation`).
3. **`uuidv7()` fallback** — timestamp-sortable UUID when no ID is available.

For full bidirectional correlation support, also provide `correlationIdRunner`. It wraps each pipeline invocation so that `getCorrelationId()` returns the pipeline's resolved ID throughout the entire handler chain — including event handlers dispatched via `eventBus.publish()`:

```typescript
import { getCorrelationId, runWithCorrelationId } from '@nestjs-pipeline/correlation';

PipelineModule.forRoot({
  correlationIdFactory: getCorrelationId,
  correlationIdRunner: runWithCorrelationId,
  // ...
})
```

### HTTP Requests

Install `@nestjs-pipeline/correlation` and apply `HttpCorrelationMiddleware` to extract correlation IDs from HTTP headers:

```typescript
import { HttpCorrelationMiddleware } from '@nestjs-pipeline/correlation';

@Module({ /* ... */ })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}
```

Then send the header:

```bash
curl -X POST http://localhost:3000/users \
  -H 'x-correlation-id: req-abc-123' \
  -H 'Content-Type: application/json' \
  -d '{"name": "Jane", "email": "jane@example.com"}'
```

The pipeline `context.correlationId` will be `"req-abc-123"` for the entire chain. If the header is omitted, a `uuidv7()` is generated automatically.

### Bull Queue Processor

```typescript
import { runWithCorrelationId } from '@nestjs-pipeline/correlation';
import { Process, Processor } from '@nestjs/bull';

@Processor('email-queue')
export class EmailProcessor {
  constructor(private readonly commandBus: CommandBus) {}

  @Process('send-email')
  async handleSendEmail(job: Job) {
    return runWithCorrelationId(job.data.correlationId, async () => {
      await this.commandBus.execute(new SendEmailCommand(job.data));
    });
  }
}
```

### RabbitMQ Handler

```typescript
import { runWithCorrelationId } from '@nestjs-pipeline/correlation';

@MessagePattern('user.created')
async handle(@Payload() data: UserPayload, @Ctx() ctx: RmqContext) {
  const correlationId = ctx.getMessage().properties.correlationId;

  return runWithCorrelationId(correlationId, () =>
    this.commandBus.execute(new SyncUserCommand(data)),
  );
}
```

### Cron Jobs

```typescript
import { runWithCorrelationId, uuidv7 } from '@nestjs-pipeline/correlation';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class SyncScheduler {
  constructor(private readonly commandBus: CommandBus) {}

  @Cron('0 * * * *')
  async hourlySync() {
    return runWithCorrelationId(uuidv7(), () =>
      this.commandBus.execute(new SyncAllUsersCommand()),
    );
  }
}
```

### Nested Commands (Sagas)

Sagas do **not** need `@UsePipeline`. Commands emitted by a saga flow through the `CommandBus` and hit the target handler's pipeline automatically. The child pipeline inherits the parent's `correlationId` and `tenantId` via `AsyncLocalStorage`:

```typescript
// Saga — no @UsePipeline needed
@Injectable()
export class OrderSagas {
  @Saga()
  orderCreated = (events$: Observable<any>): Observable<ICommand> =>
    events$.pipe(
      ofType(OrderCreatedEvent),
      map((event) => new SendOrderConfirmationCommand({ orderId: event.orderId })),
      // ↑ This command inherits correlationId & tenantId from the parent pipeline context
    );
}
```

### @WithCorrelation Decorator

Instead of manually calling `runWithCorrelationId`, use the `@WithCorrelation()` method decorator for a cleaner approach. It wraps the method body in a correlation context automatically:

```typescript
import { WithCorrelation, CorrelationFrom, getCorrelationId } from '@nestjs-pipeline/correlation';

// ── Bull (reads from job.data.correlationId by default) ──
@Process('send-email')
@WithCorrelation()
async handleSendEmail(job: Job) {
  const id = getCorrelationId(); // available anywhere in the call stack
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

// ── NATS ──
@MessagePattern('user.created')
@WithCorrelation(CorrelationFrom.nats())
async handle(@Payload() data: any, @Ctx() ctx: NatsContext) { }

// ── gRPC ──
@GrpcMethod('UsersService', 'FindOne')
@WithCorrelation(CorrelationFrom.grpc())
async findOne(data: any, metadata: Metadata) { }

// ── Cron (no ID in args → auto-generates uuidv7) ──
@Cron('0 * * * *')
@WithCorrelation()
async hourlySync() {
  await this.commandBus.execute(new SyncCommand());
}
```

### Producer-Side: Stamping Correlation IDs

When enqueuing jobs or publishing messages, stamp the current correlation ID onto the payload or headers:

```typescript
import { addCorrelationId, correlationHeaders, getCorrelationId } from '@nestjs-pipeline/correlation';

// ── Bull / BullMQ (data payload) ──
await queue.add('send-email', addCorrelationId({ userId, email }));
// → { userId, email, correlationId: '019728a3-...' }

// ── Kafka (message headers) ──
await producer.send({
  topic: 'orders',
  messages: [{ value: JSON.stringify(order), headers: correlationHeaders() }],
});
// → headers: { 'x-correlation-id': '019728a3-...' }

// ── HTTP (outgoing request) ──
await fetch(url, { headers: { ...correlationHeaders(), 'content-type': 'application/json' } });

// ── Read the current ID anywhere ──
const id = getCorrelationId(); // reads from async-local context, falls back to uuidv7()
```

---

## Pipeline Context Reference

### Properties

Every behavior receives `IPipelineContext`:

| Property | Type | Description |
|---|---|---|
| `correlationId` | `string` | Immutable ID fixed before the behavior chain starts |
| `originalCorrelationId` | `string` | Immutable snapshot of the initial correlation ID |
| `tenantId` | `string \| undefined` | Active tenant identifier (inherited from parent context or resolved via `tenantIdFactory`) |
| `request` | `TRequest` | The command / query / event instance |
| `requestType` | `Type<TRequest>` | Class constructor (e.g. `CreateUserCommand`) |
| `requestName` | `string` | Class name string (e.g. `"CreateUserCommand"`) |
| `handlerType` | `Type` | Handler class constructor |
| `handlerName` | `string` | Handler class name (e.g. `"CreateUserHandler"`) |
| `requestKind` | `'command' \| 'query' \| 'event' \| 'unknown'` | Auto-detected from `@nestjs/cqrs` metadata |
| `startedAt` | `Date` | UTC timestamp of pipeline start |
| `response` | `TResponse \| undefined` | Set after `next()` returns; `undefined` before handler runs |
| `items` | `Map<string \| symbol, unknown>` | Shared bag for inter-behavior communication |

### Using `items` for Inter-Behavior Communication

```typescript
// AuthBehavior — runs before other behaviors
@Injectable()
export class AuthBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const userId = await this.authService.getCurrentUserId();
    context.items.set('currentUserId', userId);  // ← store data
    return next();
  }
}

// AuditBehavior — runs after AuthBehavior in the chain
@Injectable()
export class AuditBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const result = await next();
    const userId = context.items.get('currentUserId');  // ← read data
    await this.auditService.log({
      action: context.requestName,
      userId,
      correlationId: context.correlationId,
    });
    return result;
  }
}
```

### Behavior Options

Pass per-handler options with the `[Behavior, { ... }]` tuple form and read them with `getBehaviorOptions()`:

```typescript
// Handler declaration
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [AuditBehavior, { action: 'user.create', severity: 'high' }],
  [LoggingBehavior, { metricLogLevel: 'verbose', requestResponseLogLevel: 'log' }],
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  /* ... */
}

// Inside AuditBehavior
async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
  const opts = context.getBehaviorOptions<AuditOptions>(AuditBehavior);
  // opts → { action: 'user.create', severity: 'high' }
  // ...
}
```

Options can also be set at the global level:

```typescript
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [
      [LoggingBehavior, { metricLogLevel: 'log', requestResponseLogLevel: 'debug' }],
    ],
    after: [
      [TraceBehavior, { tracerName: 'my-service' }],
    ],
  },
})
```

When the same behavior has options at both global and handler level, the handler
entry replaces its **whole options record** while the behavior retains its
global chain position. The core does not shallow-merge individual properties
inside those two records.

---

## Built-in LoggingBehavior

The core package ships with `LoggingBehavior` that logs request/response data and timing metrics via the NestJS `Logger`:

```typescript
import { LoggingBehavior } from '@nestjs-pipeline/core';

// Register globally with default options
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
| `excludeKeys` | `string[]` | `[]` | Keys to omit from request/response logs (supports dot notation for nested properties) |
| `excludeRequestObj` | `boolean` | `true` | If true, omits the request object from logs entirely (shows placeholder instead) |
| `excludeResponseObj` | `boolean` | `true` | If true, omits the response object from logs entirely (shows placeholder instead) |
| `logFormat` | `'text' \| 'structured'` | `'text'` | Output shape for request/response/metric/error logs. `'text'` produces a single interpolated string; `'structured'` produces a plain object (e.g. `{ msg, request }`), useful for structured loggers like `nestjs-pino`/pino that serialize to JSON |

> By default `excludeRequestObj`/`excludeResponseObj` are `true`, so out of the box you'll see the placeholders `[exclude request obj]` / `[exclude response obj]` rather than the actual payload — set them to `false` to log the real request/response.

On failure, the error log also includes the thrown error's `stack` (when it's an `Error` instance) and, if the error exposes an `optionalParams` property (e.g. a custom exception carrying extra structured context), those values are appended to the log entry as well.

To provide your own logger implementation (for example `nestjs-pino`), bind the `LOGGING_BEHAVIOR_LOGGER` token:

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

When using `nestjs-pino`, Nest log levels map to pino as:
`verbose` → `trace`, `debug` → `debug`, `log` → `info`, `warn` → `warn`, `error` → `error`, `fatal` → `fatal`.
If you use `bootstrapLogLevel: 'verbose'`, set pino `level: 'trace'`.

```typescript
// Verbose logging for a specific handler
@CommandHandler(CreateUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class CreateUserHandler { /* ... */ }

// Map specific exceptions to different log levels (e.g. log constraint violations as warnings)
@UsePipeline([LoggingBehavior, { 
  mapLogLevel: new Map([
    [UniqueConstraintException, 'warn'],
    [NotFoundException, 'debug'],
  ]) 
}])

// Disable payload logging entirely, keep timing metrics
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'none' }])

// Disable all logging for a handler
@UsePipeline([LoggingBehavior, { metricLogLevel: 'none', requestResponseLogLevel: 'none' }])
```

`LoggingBehavior` logs under the **handler's** context, not its own. The handler name is passed with each log call, so a singleton logger is never mutated and concurrent handlers cannot overwrite one another's context. With `excludeRequestObj: false, excludeResponseObj: false`:

**Output example** (on success):

```
[Nest] LOG   [CreateUserHandler] Request: {"username":"jane","email":"jane@example.com"}
[Nest] LOG   [CreateUserHandler] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler completed in 12.34ms
[Nest] DEBUG [CreateUserHandler] Response: {"id":"...","username":"jane","email":"jane@example.com"}
```

**Output example** (on error):

```
[Nest] ERROR [CreateUserHandler] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler failed after 2.10ms: Error: User already exists
```

---

## Zod Integration (`@nestjs-pipeline/zod`)

Comprehensive Zod v4 integration at every layer of a NestJS CQRS application.

### Pipeline-Level Validation

Register `ZodValidationBehavior` globally. It parses any request class that has a
static `_zodSchema` property (set automatically by `createCommand()`, `createQuery()`, or `createZodRequest()`):

```typescript
// app.module.ts
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [ZodValidationBehavior], // normalizes before per-handler behaviors
  },
})

// create-user.command.ts
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const schema = z.object({
  username: z.string().min(4),
  email: z.string().email(),
});

// Generates self-validating class with static _zodSchema, ~standard (NestJS 12), and static parse()/safeParse()
export class CreateUserCommand extends createCommand(schema) {}
//                                       ↑ attaches schema as static _zodSchema, sets requestKind: 'command'
```

If parsing fails, `ZodValidationBehavior` throws a `ZodValidationError` with
structured details from `ZodError.flatten()`. On successful object output, it
updates the existing request object to match the parsed data before the next
behavior/handler runs: keys omitted by the parsed result are removed and parsed,
coerced, transformed, or defaulted values are assigned to that same request.
The behavior uses Zod's async parser, so asynchronous refinements and
transforms are supported.

### Controller-Level Validation with ZodPipe

`ZodPipe` asynchronously validates `@Body()`, `@Param()`, `@Query()` values against a Zod schema — including synchronous or asynchronous transform/refinement schemas. NestJS awaits the pipe's promise automatically:

```typescript
import { z } from 'zod';
import { ZodPipe } from '@nestjs-pipeline/zod';

// Simple schemas
const CreateUserDtoSchema = z.object({
  email: z.email(),
  name: z.string().min(5),
});
type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

const UserIdSchema = z.string().uuid();

@Controller('users')
export class UsersController {
  // Validate request body
  @Post()
  createUser(@Body(new ZodPipe(CreateUserDtoSchema)) dto: CreateUserDto) {
    return this.commandBus.execute(new CreateUserCommand(dto));
  }

  // Validate route param (UUID format)
  @Get(':id')
  getUser(@Param('id', new ZodPipe(UserIdSchema)) id: string) {
    return this.queryBus.execute(new GetUserQuery({ userId: id }));
  }

  // Validate + transform body
  @Patch(':id')
  updateUser(
    @Param('id', new ZodPipe(UserIdSchema)) id: string,
    @Body(new ZodPipe(UpdateUserDtoSchema)) dto: UpdateUserDto,
  ) {
    return this.commandBus.execute(UpdateUserMapper.map(id, dto));
  }
}
```

### Zod Transform Mappers (DTO → Command)

Use Zod transforms to map DTOs to commands in a single step:

```typescript
// create-user.mapper.ts
import { BadRequestException } from '@nestjs/common';
import { CreateUserDtoSchema } from '../dtos/create-user.dto';
import { CreateUserCommand } from '../cqrs/commands/create-user.command';

// Schema that validates a DTO and transforms it into a command
const CreateUserMapperSchema = CreateUserDtoSchema.transform(
  ({ name, email }) => new CreateUserCommand({ username: name, email }),
);

export const CreateUserMapper = {
  map(input: CreateUserDto): CreateUserCommand {
    const result = CreateUserMapperSchema.safeParse(input);
    if (!result.success) throw new BadRequestException(result.error.flatten());
    return result.data;
  },
};

// Usage in controller
@Post()
createUser(@Body(new ZodPipe(CreateUserDtoSchema)) dto: CreateUserDto) {
  return this.commandBus.execute(CreateUserMapper.map(dto));
}
```

### Error Handling with ZodValidationFilter

Register `ZodValidationFilter` as a global exception filter to catch `ZodValidationError` and return a structured HTTP 400 response:

```typescript
// main.ts
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ZodValidationFilter());
  await app.listen(3000);
}
```

**Response format** (HTTP 400):

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "email": ["Invalid email"],
      "username": ["String must contain at least 4 character(s)"]
    }
  }
}
```

### Attaching Schemas to Plain Event Classes

Event classes that don't use `createZodRequest()` can still be parsed/validated by attaching the schema manually:

```typescript
import { ZOD_SCHEMA_KEY } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const userCreatedSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().min(1),
  email: z.email(),
});

export class UserCreatedEvent {
  static readonly [ZOD_SCHEMA_KEY] = userCreatedSchema;

  constructor(
    public readonly userId: string,
    public readonly username: string,
    public readonly email: string,
  ) {}
}
```

---

## OpenTelemetry Integration (`@nestjs-pipeline/opentelemetry`)

Auto-creates **spans** (`TraceBehavior`) and records **metrics** (`MetricsBehavior`) for every pipeline invocation with full context attributes.

### Setup

```typescript
// tracing.ts — MUST be imported before NestFactory.create()
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const sdk = new NodeSDK({
  serviceName: 'users-api',
  traceExporter: new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: 'http://localhost:4318/v1/metrics' }),
  }),
});
sdk.start();

// main.ts
import './tracing'; // ← MUST be the first import
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// app.module.ts
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    after: [
      [TraceBehavior, { tracerName: 'users-api' }],
      [MetricsBehavior, { meterName: 'users-api' }],
    ],
  },
})
```

### Span Details

Each span includes:

| Field | Example |
|---|---|
| **Span name** | `command.CreateUserCommand` |
| `pipeline.request.kind` | `command` |
| `pipeline.request.name` | `CreateUserCommand` |
| `pipeline.handler.name` | `CreateUserHandler` |
| `pipeline.correlation_id` | `019728a3-...` |
| `pipeline.started_at` | `2026-03-01T12:00:00.000Z` |
| **Status** | `OK` on success, `ERROR` with recorded exception |

### Metrics

`MetricsBehavior` records two instruments via the OTel **Metrics API** — derive throughput, error-rate, and latency percentiles per handler:

| Instrument | Type | Unit | Attributes |
|---|---|---|---|
| `pipeline.handler.duration` | Histogram | `ms` | `pipeline.request.kind/name`, `pipeline.handler.name`, `outcome` |
| `pipeline.handler.invocations` | Counter | — | + `error.type` on failures |

Metric attributes are intentionally **low-cardinality** (no `correlation_id`/`started_at`, which would explode time-series count — those live on spans).

### No SDK? No Problem.

If the OpenTelemetry SDK is not initialized, both behaviors remain safe:
`TraceBehavior` passes through without spans, while `MetricsBehavior` still does
its normal timing and metric-recording calls against a no-op meter, so recordings
are discarded. Telemetry unavailability does not make either behavior throw, but
the metrics path is not a literal zero-overhead path. A warning is logged once at
startup:

```
[Nest] WARN [TraceBehavior] OpenTelemetry SDK is NOT initialized — TraceBehavior will pass through without tracing.
[Nest] WARN [MetricsBehavior] OpenTelemetry metrics SDK is NOT initialized — MetricsBehavior will record to a no-op meter (metrics discarded).
```

---

## DDD Example

The `ddd/` directory demonstrates Domain-Driven Design with `@nestjs-pipeline`.

### `ddd/core` — Reusable DDD Primitives

The `@nestjs-pipeline/ddd-core` package (`ddd/core/`) provides the foundational building blocks for any domain layer:

| Export                | Description                                                                           |
|-----------------------|-----------------------------------------------------------------------------------------|
| `RootEntity`          | Abstract base entity with UUID v7 identity, `createdAt`/`updatedAt` lifecycle, and mutation tracking |
| `CacheableEntity`     | Extends `RootEntity` — adds `cacheKey` (`<prefixKey><id>`) used by `@Cache`/`@FromCache` decorators |
| `RootEntitySnapshot`  | Interface for serializing/rehydrating entities                                        |
| `DomainEvent`         | Abstract base class for domain events (carries a UUID v7 `id`)                        |
| `RootDomainEvent`     | Domain event that carries a reference to the originating entity                       |
| `DomainOutcome`       | Base outcome class — bundles domain events produced by an operation                   |
| `RootDomainOutcome`   | Outcome that pairs an entity with its domain events                                   |
| `Mutate`              | Decorator that calls `onUpdate()` after a method executes                             |
| `ICache<T>`           | Interface for cache providers (`get`, `set`, `delete`)                                |
| `CommandRepository`   | Abstract base for write repositories — holds an `ICache` and defines `save(outcome)` |
| `QueryRepository`     | Abstract base for read repositories — holds an `ICache` and defines `find(query)`    |
| `@Cache()`            | Decorator for `save()` — write-through cache on successful writes, evict on delete   |
| `@FromCache()`        | Decorator for `find()` — read-through cache with optional hydration function         |
| `Method`              | Utility type for extracting method signatures                                         |

Import them in your domain layer:

```typescript
import { CacheableEntity, RootDomainEvent, RootDomainOutcome, Mutate } from '@nestjs-pipeline/ddd-core';
```

### `ddd/users-api` — Full Working Application

The `ddd/users-api/` directory contains a complete working application:

```bash
cd ddd/users-api
pnpm install
pnpm build              # build workspace dependencies
cp .env.example .env    # create local environment file (edit as needed)
pnpm db:migrate         # apply schema + data migrations (idempotent)
pnpm dev                # start with ts-node (watch mode)
```

Configure the database via environment variables (defaults to a local file):

| Variable             | Default         | Description                          |
|----------------------|-----------------|--------------------------------------|
| `DATABASE_URL` | `file:src/persistence/local.db` | libSQL URL, used unchanged for one tenant |
| `SQLITE_TENANTS` | _(none)_ | Additional libSQL tenant names; local files get a tenant suffix |
| `SQLITE_DATABASE_TEMPLATE` | _(none)_ | URL containing `{tenant}`; required for multiple remote tenants |
| `AUTH_TOKEN`   | _(none)_        | Auth token for libSQL remote databases (e.g. Turso) |

Both persistence engines require `x-tenant-schema` on routed HTTP requests.
PostgreSQL selects a schema; libSQL selects the corresponding database.

**CRUD operations:**

```bash
# Log in as the seeded admin, then copy `token` from the JSON response.
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -H 'x-tenant-schema: tenant' \
  -d '{"email":"alice+tenant@seed.local","code":"secret-code"}'
export TOKEN='<token from login response>'

# Create a user
curl -X POST http://localhost:3000/users \
  -H 'Content-Type: application/json' \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'x-correlation-id: demo-123' \
  -d '{"name": "Aristotelis", "email": "aristotelis@example.com"}'

# Get all users
curl http://localhost:3000/users \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN"

# Get by ID
curl http://localhost:3000/users/<id> \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN"

# Update
curl -X PATCH http://localhost:3000/users/<id> \
  -H 'Content-Type: application/json' \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "NewName"}'

# Delete
curl -X DELETE http://localhost:3000/users/<id> \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN"

# Run with Fastify adapter
ADAPTER=fastify pnpm start
```

**What it demonstrates:**

- Global + per-handler pipeline behaviors
- Per-handler CASL authorization with inline `rules` on `CaslBehaviorOptions` and `CaslBehavior`
- MikroORM-backed CASL providers (roles, capabilities, user context)
- Versioned database migrations with tracking (`mikro_orm_migrations` table)
- Zod-parsed/validated commands and queries via `createCommand()` and `createQuery()`
- Controller-level `ZodPipe` validation
- Zod transform mappers (DTO → Command mapping)
- OpenTelemetry tracing with `TraceBehavior`
- Command- and event-scoped `DeadLetterBehavior` sending failed executions to a BullMQ `dead-letters` queue for inspection and replay (restricted to command and event failures, excluding read queries and validation errors, with `UserCreatedHandler` opting into `{ rethrow: false }` only after successful delivery); transport failures are logged and preserve the original handler error
- Per-handler `RateLimitBehavior` throttling `CreateUserHandler` to 5 registrations / 60s per email (in-memory limiter), with `RateLimitExceededFilter` mapping breaches to HTTP 429 + `Retry-After`
- Per-handler `AuditBehavior` recording the sensitive `user.delete` action (actor, outcome, duration, redacted payload) to the default `LogAuditSink`, with the actor resolved from the request-scoped session
- Per-handler `IdempotencyBehavior` atomically excluding concurrent duplicates for `CreateUserHandler` per tenant + principal + email and replaying completed successful responses; with the default `releaseOnError: true`, a failed execution releases the key so a later retry may execute again. `IdempotencyConflictFilter` maps in-flight duplicates to HTTP 409 and payload-mismatched key reuse to HTTP 422
- DDD-style `User` entity built on `ddd-core` primitives (`CacheableEntity`, `RootDomainEvent`, `RootDomainOutcome`)
- MikroORM (libSQL driver) persistence with a normalized schema
- Pluggable `ICache<T>` — `MikroOrmCache` (MikroORM-backed, TTL-aware) or `MemoryCache` swapped via a single provider token
- Correlation ID propagation across handlers and events
- Express and Fastify adapter support

---

## Repository Structure

```
nestjs-pipeline/
├── package.json                  # root — workspace scripts
├── pnpm-workspace.yaml           # declares packages/* and ddd/*
├── tsconfig.base.json            # shared TypeScript config
├── packages/
│   ├── pipeline/                 # @nestjs-pipeline/core
│   │   └── src/
│   │       ├── behaviors/        # LoggingBehavior
│   │       ├── constants/        # pipelineStore (AsyncLocalStorage)
│   │       ├── decorators/       # @UsePipeline
│   │       ├── helpers/          # uuidv7, safeStringify
│   │       ├── interfaces/       # IPipelineBehavior, IPipelineContext
│   │       ├── options/          # PipelineModuleOptions, GlobalBehaviorsOptions
│   │       ├── services/         # PipelineBootstrapService
│   │       ├── pipeline.context.ts
│   │       └── pipeline.module.ts
│   ├── pipeline-correlation/      # @nestjs-pipeline/correlation
│   │   └── src/
│   │       ├── decorators/       # @WithCorrelation, CorrelationFrom
│   │       ├── helpers/          # uuidv7
│   │       ├── middlewares/      # HttpCorrelationMiddleware
│   │       ├── options/          # CorrelationOptions
│   │       └── correlation.store.ts    # correlationStore, getCorrelationId, runWithCorrelationId
│   ├── pipeline-zod/             # @nestjs-pipeline/zod
│   │   └── src/
│   │       ├── errors/           # ZodValidationError
│   │       ├── filters/          # ZodValidationFilter
│   │       ├── pipes/            # ZodPipe
│   │       └── zod-validation.behavior.ts  # parse/validate and apply successful object output
│   ├── pipeline-casl/            # @nestjs-pipeline/casl
│   │   └── src/
│   │       ├── constants/        # Injection tokens
│   │       ├── helpers/          # Capability parsing, interpolation
│   │       ├── interfaces/       # IRoleProvider, IUserCapabilityProvider, IUserContextResolver
│   │       ├── providers/        # StaticRoleProvider
│   │       ├── services/         # buildAbility factory
│   │       ├── casl.behavior.ts
│   │       └── casl.module.ts
│   ├── pipeline-opentelemetry/   # @nestjs-pipeline/opentelemetry
│   │   └── src/
│   │       ├── trace.behavior.ts     # TraceBehavior (OTel Trace API)
│   │       └── metrics.behavior.ts   # MetricsBehavior (OTel Metrics API)
│   ├── pipeline-resilience/      # @nestjs-pipeline/resilience
│   │   └── src/
│   │       ├── constants/        # RESILIENCE_DEFAULT_OPTIONS token
│   │       ├── helpers/          # buildResiliencePolicy (cockatiel composition)
│   │       ├── interfaces/       # ResilienceBehaviorOptions and layer option types
│   │       ├── resilience.behavior.ts
│   │       └── resilience.module.ts
│   ├── pipeline-cache/           # @nestjs-pipeline/cache
│   │   └── src/
│   │       ├── constants/        # PIPELINE_CACHE, CACHE_DEFAULT_OPTIONS tokens
│   │       ├── helpers/          # buildCache / buildKeyv (store factory), cache-key
│   │       ├── interfaces/       # CacheModuleOptions, CacheBehaviorOptions, CacheStoreConfig
│   │       ├── cache.behavior.ts
│   │       └── cache.module.ts
│   ├── pipeline-feature-flags/   # @nestjs-pipeline/feature-flags
│   │   └── src/
│   │       ├── constants/        # FEATURE_FLAGS_CLIENT and default-options/context tokens
│   │       ├── errors/           # FeatureDisabledError
│   │       ├── helpers/          # buildEvaluationContext (targeting context)
│   │       ├── interfaces/       # FeatureFlagBehaviorOptions, FeatureFlagsModuleOptions
│   │       ├── feature-flag.behavior.ts  # FeatureFlagBehavior (OpenFeature gating)
│   │       └── feature-flags.module.ts
│   ├── pipeline-deadletter/      # @nestjs-pipeline/deadletter
│   │   └── src/
│   │       ├── constants/        # DEAD_LETTER_TRANSPORT, DEAD_LETTER_DEFAULT_OPTIONS tokens
│   │       ├── helpers/          # buildDeadLetterRecord
│   │       ├── interfaces/       # DeadLetterTransport, DeadLetterRecord, options types
│   │       ├── transports/       # BullMQ, RabbitMQ, Postgres bundled transports
│   │       ├── dead-letter.behavior.ts   # DeadLetterBehavior (capture/send attempt for failed requests)
│   │       └── dead-letter.module.ts
│   ├── pipeline-rate-limit/      # @nestjs-pipeline/rate-limit
│   │   └── src/
│   │       ├── constants/        # RATE_LIMITER, RATE_LIMIT_DEFAULT_OPTIONS tokens
│   │       ├── errors/           # RateLimitExceededError
│   │       ├── filters/          # RateLimitExceededFilter (HTTP 429 + Retry-After)
│   │       ├── helpers/          # buildRateLimitKey
│   │       ├── interfaces/       # RateLimiterLike, RateLimitBehaviorOptions, module options
│   │       ├── rate-limit.behavior.ts    # RateLimitBehavior (rate-limiter-flexible)
│   │       └── rate-limit.module.ts
│   ├── pipeline-audit/           # @nestjs-pipeline/audit
│   │   └── src/
│   │       ├── constants/        # AUDIT_SINK, AUDIT_DEFAULT_OPTIONS tokens
│   │       ├── helpers/          # redactValue, buildAuditRecord
│   │       ├── interfaces/       # AuditSink, AuditRecord, options types
│   │       ├── sinks/            # LogAuditSink (default), PostgresAuditSink drop-in
│   │       ├── audit.behavior.ts # AuditBehavior (records who/what/outcome/duration)
│   │       └── audit.module.ts
│   └── pipeline-idempotency/     # @nestjs-pipeline/idempotency
│       └── src/
│           ├── constants/        # IDEMPOTENCY_STORE, IDEMPOTENCY_DEFAULT_OPTIONS tokens
│           ├── errors/           # IdempotencyConflictError
│           ├── filters/          # IdempotencyConflictFilter (HTTP 409 / 422)
│           ├── helpers/          # fingerprintValue (stable payload hash)
│           ├── interfaces/       # IdempotencyStore, IdempotencyRecord, options types
│           ├── stores/           # Memory (default), Redis, Postgres drop-in stores
│           ├── idempotency.behavior.ts   # IdempotencyBehavior (concurrent exclusion + successful replay)
│           └── idempotency.module.ts
└── ddd/
    ├── core/                     # @nestjs-pipeline/ddd-core — reusable DDD primitives
    │   └── domain/
    │       ├── events/            # DomainEvent, RootDomainEvent
    │       ├── interfaces/        # RootEntitySnapshot
    │       ├── models/            # RootEntity
    │       └── outcomes/          # DomainOutcome, RootDomainOutcome
    └── users-api/                # Full working example using ddd-core + casl
        └── src/
            ├── persistence/      # MikroOrmStore, MikroOrmCache, schemas/, migrate.ts
            ├── roles/            # MikroORM-backed CASL providers (role CRUD + capabilities)
            ├── auths/            # Auth CRUD + user-context resolver
            └── users/
                ├── cqrs/         # Commands, queries, events
                ├── domain/       # User entity, domain events, outcomes
                └── persistence/  # Repositories
```

---

## Development

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Type-check all packages
pnpm lint

# Format / lint with Biome
pnpm biome check .

# Clean build artifacts
pnpm clean
```

## Adding a New Behavior Package

1. Create `packages/pipeline-<name>/` with `package.json`, `tsconfig.json`, `tsconfig.build.json`, and `src/index.ts`.

2. Add `@nestjs-pipeline/core` as a peer dependency:

   ```json
   {
     "peerDependencies": {
       "@nestjs-pipeline/core": "^0.1.19"
     },
     "devDependencies": {
       "@nestjs-pipeline/core": "workspace:*"
     }
   }
   ```

3. Implement `IPipelineBehavior`:

   ```typescript
   import { Injectable } from '@nestjs/common';
   import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

   @Injectable()
   export class RateLimitBehavior implements IPipelineBehavior {
     constructor(private readonly rateLimiter: RateLimiterService) {}

     async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
       const key = `${context.requestKind}:${context.requestName}`;
       await this.rateLimiter.consume(key);
       return next();
     }
   }
   ```

4. Export from `src/index.ts`:

   ```typescript
   export { RateLimitBehavior } from './rate-limit.behavior';
   ```

5. The package is automatically included via `pnpm-workspace.yaml`.

---

## License and Commercial Use

This software is **Dual-Licensed**.

By default, this project is licensed under the **GNU AGPLv3** (see the `LICENSE` file). You can use, modify, and distribute it freely, provided your entire application is also open-sourced under the AGPLv3.

**Commercial License (No AGPL Restrictions)**

If you are using this software commercially and cannot (or do not want to) open-source your application under the AGPLv3, you must use the **Commercial License** (see `COMMERCIAL_LICENSE.txt`).

Revenue-based pricing:

| Annual Gross Revenue | Fee |
|---|---|
| Under $500,000 | **Free** |
| $500,001 — $10,000,000 | 0.1% of gross revenue |
| $10,000,001 — $50,000,000 | 0.05% of gross revenue |
| Over $50,000,000 | 0.01% of gross revenue (capped at $50,000/year) |

Contact: **aristotelis@ik.me**
