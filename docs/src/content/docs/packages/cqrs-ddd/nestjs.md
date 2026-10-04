---
title: "@cqrs-ddd/nestjs"
description: "NestJS adapter for the @cqrs-ddd packages: runs @nestjs/cqrs handlers through pipeline behaviors, standardizes error responses with ErrorFilter, and wires correlation and job context."
editUrl: false
---

[![npm version](https://img.shields.io/npm/v/@cqrs-ddd/nestjs.svg)](https://www.npmjs.com/package/@cqrs-ddd/nestjs)
[![License](https://img.shields.io/npm/l/@cqrs-ddd/nestjs.svg)](https://www.npmjs.com/package/@cqrs-ddd/nestjs)

The NestJS adapter for the [`@cqrs-ddd`](https://github.com/aristoteliss/ddd-cqrs) packages.

Applications retain the official `@nestjs/cqrs` module (`CommandBus`, `QueryBus`, `EventBus`, `@CommandHandler`, `@QueryHandler`, `@EventsHandler`, `EventPublisher`). This package provides the glue between NestJS dependency injection and `@cqrs-ddd/pipeline`:

- `PipelineModule.forRoot({ globalBehaviors, sources, diagnostics })` discovers every `@nestjs/cqrs` handler at bootstrap and wraps its execution with its compiled behavior chain.
- `ErrorFilter` (`APP_FILTER`) converts package and domain errors into standard NestJS `HttpException` instances with the canonical `{ statusCode, error, message }` payload and appropriate headers (e.g., `Retry-After`).
- `@cqrs-ddd/nestjs/correlation` provides `CorrelationMiddleware` to bind HTTP correlation IDs into async context and response headers.
- `@cqrs-ddd/nestjs/job-context` provides `JobContextModule.forRoot(...)` to propagate tenant, correlation, and principal context to background job processors.

## Contents

- [Installation](#installation)
- [Architecture & Mechanics](#architecture--mechanics)
- [PipelineModule](#pipelinemodule)
  - [Module Registration](#module-registration)
  - [Handler Discovery](#handler-discovery)
  - [Providing Behaviors in Modules](#providing-behaviors-in-modules)
  - [Strict Diagnostic Checks](#strict-diagnostic-checks)
- [Error Handling](#error-handling)
  - [ErrorFilter](#errorfilter)
  - [Direct Conversion Utilities](#direct-conversion-utilities)
  - [Standard Error Payloads](#standard-error-payloads)
- [Correlation Middleware](#correlation-middleware)
- [Job Context Module](#job-context-module)
- [Complete Setup Example](#complete-setup-example)
- [Package Facade (@nestjs-pipeline/cqrs-ddd)](#package-facade-nestjs-pipelinecqrs-ddd)
- [License](#license)

## Installation

```bash
pnpm add @cqrs-ddd/nestjs @cqrs-ddd/pipeline @cqrs-ddd/core
# or
npm install @cqrs-ddd/nestjs @cqrs-ddd/pipeline @cqrs-ddd/core
```

### Peer Dependencies

- Required: `@nestjs/common` (>=12.0.0), `@nestjs/core` (>=12.0.0), `@nestjs/cqrs` (>=12.0.0), `@cqrs-ddd/pipeline` (^0.5.0), `@cqrs-ddd/core` (^0.5.0), Node.js >= 22.12.0.
- Optional peers (automatically converted by `ErrorFilter` when present):
  - `@cqrs-ddd/pipeline-zod`
  - `@cqrs-ddd/pipeline-casl`
  - `@cqrs-ddd/pipeline-feature-flags`
  - `@cqrs-ddd/pipeline-rate-limit`
  - `@cqrs-ddd/pipeline-idempotency`
  - `@cqrs-ddd/pipeline-correlation`
  - `@cqrs-ddd/pipeline-job-context`

## Architecture & Mechanics

NestJS handles dependency injection, routing, module composition, and CQRS dispatch. `@cqrs-ddd/nestjs` integrates pipeline behaviors into that execution model:

```
                      HTTP / Job Ingress
                              │
                    [CorrelationMiddleware]
                              │
                    [CommandBus / QueryBus]
                              │
                 ┌────────────┴────────────┐
                 │    Handler Instance     │
                 │   (Wrapped at Startup)  │
                 ├─────────────────────────┤
                 │ Behavior 1 (Logging)    │
                 │ Behavior 2 (Idempotency)│
                 │ Behavior 3 (CASL Auth)  │
                 │         ...             │
                 │ Handler.execute()       │
                 └────────────┬────────────┘
                              │
                    [Domain Exceptions]
                              │
                        [ErrorFilter]
                              │
                    Standard NestJS Body
```

### How Handlers Are Wrapped

1. At application bootstrap (`OnApplicationBootstrap`), `PipelineBootstrap` queries NestJS's `DiscoveryService` for all registered providers.
2. It detects handlers decorated with `@CommandHandler`, `@QueryHandler`, and `@EventsHandler`.
3. For each handler, it inspects pipeline metadata attached via `@UsePipeline` and `@SkipPipeline`.
4. It compiles a single pipeline plan using `compilePipelinePlan` from `@cqrs-ddd/pipeline`, combining global behaviors and handler-specific behaviors.
5. It resolves the singleton instance of each required behavior from the module container.
6. It wraps `execute` on command and query handlers (or `handle` on event handlers) directly on the discovered handler instance using `createPipelineRunner`.
7. When the application shuts down (`OnModuleDestroy`), the original handler methods are cleanly restored.

## PipelineModule

### Module Registration

Register `PipelineModule.forRoot` in your root or infrastructure module:

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule } from '@cqrs-ddd/nestjs';
import { LoggingBehavior } from '@cqrs-ddd/pipeline';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      sources: {
        tenantId: tenantSource,
        correlationId: correlationSource,
      },
      globalBehaviors: [
        { scope: 'all', before: [LoggingBehavior] },
      ],
      diagnostics: 'strict', // 'strict' (default) | 'warn' | 'off'
    }),
  ],
})
export class AppModule {}
```

#### PipelineOptions

| Option | Type | Description |
| --- | --- | --- |
| `globalBehaviors` | `GlobalBehaviorsOptions \| GlobalBehaviorsOptions[]` | Behaviors placed globally for `'all'`, `'commands'`, `'queries'`, or `'events'`. |
| `sources` | `ContextSources` | Sources for pipeline context attributes (`tenantId`, `correlationId`, `principalId`, etc.). |
| `diagnostics` | `'strict' \| 'warn' \| 'off'` | Diagnostic mode. Defaults to `'strict'`. |

### Handler Discovery

Handlers declare their pipeline behaviors using the standard `@UsePipeline` decorator:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { IdempotencyBehavior } from '@cqrs-ddd/pipeline-idempotency';
import { CaslBehavior } from '@cqrs-ddd/pipeline-casl';
import { ZodValidationBehavior } from '@cqrs-ddd/pipeline-zod';

@CommandHandler(CreateUserCommand)
@UsePipeline(
  ZodValidationBehavior,
  IdempotencyBehavior,
  CaslBehavior,
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, User> {
  async execute(command: CreateUserCommand): Promise<User> {
    // Handler business logic executes inside the compiled pipeline
    return user;
  }
}
```

### Providing Behaviors in Modules

Behaviors are instantiated as singleton providers within the modules that own their dependencies. The provider token **must be the behavior class**:

```typescript
import { Module, Logger } from '@nestjs/common';
import { LoggingBehavior } from '@cqrs-ddd/pipeline';
import { IdempotencyBehavior, MemoryIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';

@Module({
  providers: [
    {
      provide: LoggingBehavior,
      useFactory: () => new LoggingBehavior(new Logger('Pipeline')),
    },
    {
      provide: IdempotencyBehavior,
      useFactory: () => new IdempotencyBehavior(new MemoryIdempotencyStore()),
    },
  ],
  exports: [LoggingBehavior, IdempotencyBehavior],
})
export class ReliabilityModule {}
```

### Strict Diagnostic Checks

When `diagnostics: 'strict'` is enabled (the default), `PipelineBootstrap` enforces architectural safety rules at startup and aborts initialization with informative errors if any check fails:

1. **Missing Behavior Provider**: If a handler requires a behavior but no module registered it as a provider under its class, bootstrap fails:
   ```
   Error: IdempotencyBehavior runs in the pipeline of CreateUserHandler, but no module provides it. Register it as a provider of the module that configures it.
   ```
2. **Duplicate Behavior Provider**: If multiple modules register a provider for the same behavior token, bootstrap fails to prevent import-order ambiguity:
   ```
   Error: LoggingBehavior is provided by ObservabilityModule and SharedModule; exactly one module provides each behavior, otherwise which instance a handler gets would depend on import order.
   ```
3. **Request-Scoped Handlers Prohibited**: If a handler or any of its dependencies has request scope (`Scope.REQUEST`), bootstrap throws immediately. Handlers running pipeline behaviors must be singletons; contextual request information must be accessed via async local storage context sources:
   ```
   Error: CreateUserHandler runs pipeline behaviors but is request-scoped, itself or through a dependency; Nest builds it per request, so its pipeline would never run. Make it a singleton and read request data from async context.
   ```
4. **Behavior Contracts**: Contract invariants (such as ordering constraints, required dependencies, or caching behavior placement) are validated via `validateBehaviorContracts`.

## Error Handling

### ErrorFilter

`ErrorFilter` is a global NestJS exception filter extending `BaseExceptionFilter`. It catches all exceptions, inspects whether the error originates from `@cqrs-ddd`, maps it to an appropriate `HttpException`, applies necessary HTTP response headers (such as `Retry-After`), and forwards to NestJS:

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ErrorFilter } from '@cqrs-ddd/nestjs';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: ErrorFilter,
    },
  ],
})
export class AppModule {}
```

You can also extend `ErrorFilter` to add application-specific error transformations:

```typescript
import { Catch, ArgumentsHost } from '@nestjs/common';
import { ErrorFilter } from '@cqrs-ddd/nestjs';

@Catch()
export class DomainExceptionFilter extends ErrorFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    // Custom handling if needed, then delegate to ErrorFilter
    super.catch(exception, host);
  }
}
```

### Direct Conversion Utilities

`@cqrs-ddd/nestjs` exports standalone helper functions for converting domain errors without running through the filter:

```typescript
import { httpAnswer, toHttpException, validationMessages } from '@cqrs-ddd/nestjs';

// 1. toHttpException
const exception = toHttpException(domainError);
if (exception) {
  throw exception;
}

// 2. httpAnswer (includes headers)
const answer = httpAnswer(new RateLimitExceededError({ limit: 10, windowMs: 60000, retryAfterMs: 5000 }));
if (answer) {
  console.log(answer.exception.getStatus()); // 429
  console.log(answer.headers);               // { 'Retry-After': '5' }
}

// 3. validationMessages
const messages = validationMessages({
  formErrors: ['Submission rejected'],
  fieldErrors: { email: ['Must be a valid email'], name: ['Required'] },
});
// ['Submission rejected', 'email: Must be a valid email', 'name: Required']
```

### Standard Error Payloads

All converted errors match the standard NestJS HTTP error envelope:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["email: Must be a valid email"]
}
```

#### Mappings Table

| Package Error | Status Code | HTTP Status | Headers |
| --- | --- | --- | --- |
| `ZodValidationError` | 400 | Bad Request | — |
| `InvalidValueException` | 400 | Bad Request | — |
| `MissingTenantContextError` | 400 | Bad Request | — |
| `UnauthorizedActionException` | 403 | Forbidden | — |
| `FeatureDisabledError` | 403 / 404 | Forbidden / Not Found | — |
| `EntityNotFoundException` | 404 | Not Found | — |
| `ConcurrencyConflictError` | 409 | Conflict | — |
| `IdempotencyConflictError` | 409 | Conflict | — |
| `RateLimitExceededError` | 429 | Too Many Requests | `Retry-After: <seconds>` |
| `TransientOperationError` | 503 | Service Unavailable | — |

## Correlation Middleware

`@cqrs-ddd/nestjs/correlation` provides `CorrelationMiddleware`, which reads incoming correlation headers (e.g., `x-correlation-id`), generates a UUIDv7 correlation ID if absent, binds it to the async execution context, and sets the correlation header on the outgoing response.

Register the middleware in your root module's `configure` method:

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { CorrelationMiddleware } from '@cqrs-ddd/nestjs/correlation';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationMiddleware)
      .forRoutes('*');
  }
}
```

## Job Context Module

`@cqrs-ddd/nestjs/job-context` provides `JobContextModule` to seamlessly integrate background workers (such as BullMQ processors or Kafka consumers) with `@cqrs-ddd/pipeline-job-context`. It registers the job principal, tenant list, and context sources on application bootstrap and unregisters them on shutdown:

```typescript
import { Module } from '@nestjs/common';
import { JobContextModule } from '@cqrs-ddd/nestjs/job-context';
import { AuthsModule } from '../auths/auths.module.js';
import { SessionJobPrincipal } from '../auths/session-job-principal.js';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

@Module({
  imports: [
    JobContextModule.forRoot({
      imports: [AuthsModule],
      principal: SessionJobPrincipal,
      tenants: ['tenant_a', 'tenant_b'],
      sources: {
        tenantId: tenantSource,
        correlationId: correlationSource,
      },
    }),
  ],
})
export class BackgroundWorkerModule {}
```

## Complete Setup Example

Here is a complete setup showcasing `PipelineModule`, `ErrorFilter`, and `CorrelationMiddleware`:

```typescript
import { Module, NestModule, MiddlewareConsumer, Logger } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule, ErrorFilter } from '@cqrs-ddd/nestjs';
import { CorrelationMiddleware } from '@cqrs-ddd/nestjs/correlation';
import { LoggingBehavior } from '@cqrs-ddd/pipeline';
import { CaslBehavior, CaslAuthorizer } from '@cqrs-ddd/pipeline-casl';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      sources: {
        tenantId: tenantSource,
        correlationId: correlationSource,
      },
      globalBehaviors: [
        { scope: 'all', before: [LoggingBehavior] },
      ],
      diagnostics: 'strict',
    }),
  ],
  providers: [
    {
      provide: LoggingBehavior,
      useFactory: () => new LoggingBehavior(new Logger('Pipeline')),
    },
    {
      provide: CaslBehavior,
      useFactory: (authorizer: CaslAuthorizer) => new CaslBehavior(authorizer),
      inject: [CaslAuthorizer],
    },
    {
      provide: APP_FILTER,
      useClass: ErrorFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationMiddleware)
      .forRoutes('*');
  }
}
```

## Package Facade (@nestjs-pipeline/cqrs-ddd)

For backwards compatibility and unified monorepo naming, the package `@nestjs-pipeline/cqrs-ddd` is also provided. It is a zero-code facade that re-exports `@cqrs-ddd/nestjs` directly:

```typescript
// Equivalent imports:
import { PipelineModule, ErrorFilter } from '@cqrs-ddd/nestjs';
import { PipelineModule, ErrorFilter } from '@nestjs-pipeline/cqrs-ddd';
```

## License

This package is part of the `nestjs-pipeline` monorepo. See repository license details.

