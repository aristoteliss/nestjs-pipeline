---
title: "Getting started"
---

## 1. Install

Requires **Node.js 22.12** or later, **Nest 12.1** or a later 12.x (`@nestjs/common`,
`@nestjs/core`) and **`@nestjs/cqrs` 12.1** or a later 12.x.

```bash
# Core NestJS CQRS and pipeline engine
pnpm add @cqrs-ddd/nestjs @cqrs-ddd/pipeline @nestjs/cqrs @nestjs/common @nestjs/core reflect-metadata rxjs

# Optional behavior packages
pnpm add @cqrs-ddd/pipeline-idempotency           # Deduplication & response replay (+ optional redis/pg)
pnpm add @cqrs-ddd/pipeline-cache cache-manager keyv # Read-through query cache (+ optional @keyv/redis, ...)
pnpm add @cqrs-ddd/pipeline-casl @casl/ability   # ABAC authorization with CASL
pnpm add @cqrs-ddd/pipeline-audit                # Audit logging (log sink default; + optional pg)
pnpm add @cqrs-ddd/pipeline-rate-limit rate-limiter-flexible # Quotas & rate limiting
pnpm add @cqrs-ddd/pipeline-resilience cockatiel # Retries, circuit breakers, timeouts, bulkheads
pnpm add @cqrs-ddd/pipeline-deadletter bullmq    # Dead-letter capture (or amqplib / pg)
pnpm add @cqrs-ddd/pipeline-feature-flags @openfeature/server-sdk # Feature flag evaluations
pnpm add @cqrs-ddd/pipeline-opentelemetry @opentelemetry/api      # Distributed tracing & metrics
pnpm add @cqrs-ddd/pipeline-zod zod              # Schema validation
pnpm add @cqrs-ddd/pipeline-tenant               # Multi-tenant async context
pnpm add @cqrs-ddd/pipeline-correlation          # Request correlation ID context
pnpm add @cqrs-ddd/pipeline-job-context          # Async queue job context propagation
```

## 2. Register Module and Behavior Providers <a id="2-register-the-module"></a>

In the new architecture, behaviors are decoupled classes (`IPipelineBehavior`). Each behavior is registered as a **standard singleton provider** under its own class token in the module that configures it. `PipelineModule.forRoot()` coordinates the global pipeline and context sources:

```typescript
// app.module.ts
import {
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import {
  CorrelationMiddleware,
  PipelineModule,
} from '@cqrs-ddd/nestjs';
import {
  LoggingBehavior,
  logging,
} from '@cqrs-ddd/pipeline';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';
import { ZodValidationBehavior } from '@cqrs-ddd/pipeline-zod';
import { TraceBehavior } from '@cqrs-ddd/pipeline-opentelemetry';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      // Async context sources for tenant and correlation ID
      sources: { tenantId: tenantSource, correlationId: correlationSource },
      diagnostics: 'strict', // Fails fast at startup on broken ordering contracts
      globalBehaviors: [
        {
          scope: 'all',
          before: [
            logging({ requestResponseLogLevel: 'debug' }),
            ZodValidationBehavior,
          ],
          after: [
            [TraceBehavior, { tracerName: 'my-service' }],
          ],
        },
      ],
    }),
  ],
  providers: [
    // Register behavior instances as singleton providers under their class tokens:
    {
      provide: LoggingBehavior,
      useFactory: () => new LoggingBehavior(new Logger('Pipeline')),
    },
    ZodValidationBehavior,
    TraceBehavior,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Propagates x-correlation-id headers into the async context
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
```

## 3. Define a Command with Zod Validation

```typescript
// create-user.command.ts
import { createCommand } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

const schema = z.object({
  username: z.string().min(4),
  email: z.string().email(),
});

export class CreateUserCommand extends createCommand(schema) {}
```

## 4. Write the CQRS Handler

The handler is a standard `@nestjs/cqrs` handler decorated with `@UsePipeline`:

```typescript
// create-user.handler.ts
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline, LoggingBehavior } from '@cqrs-ddd/pipeline';
import { CreateUserCommand } from './create-user.command.js';

@CommandHandler(CreateUserCommand)
@UsePipeline(
  // Overrides global LoggingBehavior options for this handler while retaining its outer position
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateUserCommand): Promise<User> {
    const user = User.create(command.username, command.email);
    await this.userRepository.save(user);

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

## 5. Wire Up the Controller

```typescript
// users.controller.ts
import { Body, Controller, Get, Param, Post, HttpCode } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';

const CreateUserDtoSchema = z.object({ name: z.string().min(4), email: z.string().email() });
type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(201)
  async createUser(@Body() dto: CreateUserDto) {
    return this.commandBus.execute(
      new CreateUserCommand({ username: dto.name, email: dto.email }),
    );
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.queryBus.execute(new GetUserQuery({ userId: id }));
  }
}
```

## 6. Bootstrap with `ErrorFilter`

In `main.ts`, register `@cqrs-ddd/nestjs`'s `ErrorFilter` (or extend it in a `DomainExceptionFilter`). It maps validation errors, pipeline contract exceptions, domain errors, and concurrency conflicts to standard NestJS HTTP responses (`{ statusCode, error, message, ... }`):

```typescript
// main.ts
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ErrorFilter } from '@cqrs-ddd/nestjs';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const httpAdapter = app.get(HttpAdapterHost);

  app.useGlobalFilters(new ErrorFilter(httpAdapter));
  await app.listen(3000);
}
bootstrap();
```
