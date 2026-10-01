---
title: "Getting started"
---

## 1. Install

Requires **Node.js 22.12** or later, **Nest 12.1** or a later 12.x (`@nestjs/common`,
`@nestjs/core`) and **`@nestjs/cqrs` 12.1** or a later 12.x. Nest 12.0.x drops the `@Optional()` markers of a
base class in a subclass that declares no constructor of its own.

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
pnpm add @nestjs-pipeline/tenant   # currentTenantId(): the running pipeline's tenant
pnpm add @nestjs-pipeline/job-context   # a request's tenant, correlation id and principal in its queue jobs

# Optional: pino logger integration
pnpm add nestjs-pino pino-http pino-pretty
```

## 2. Register the Module

```typescript
// app.module.ts
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule, LoggingBehavior } from '@nestjs-pipeline/core';
import {
  correlationSource,
  HttpCorrelationMiddleware,
} from '@nestjs-pipeline/correlation';
import { tenantSource } from '@nestjs-pipeline/tenant';
import { ZodValidationBehavior, zodBadRequest } from '@nestjs-pipeline/zod';
import { TraceBehavior } from '@nestjs-pipeline/opentelemetry';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      // Where each pipeline takes its tenant and correlation id from.
      sources: { tenantId: tenantSource, correlationId: correlationSource },
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
  providers: [
    // Validates route parameters declared with `{ schema }` (step 5).
    {
      provide: APP_PIPE,
      useValue: new StandardSchemaValidationPipe({ exceptionFactory: zodBadRequest }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}
```

Without `sources`, pipelines have no tenant and generate their own correlation id, and
bootstrap logs a warning; pass `sources: {}` to run without them on purpose.

## 3. Define a Command with Zod Validation

```typescript
// create-user.command.ts
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

// 1. Define the schema
const schema = z.object({
  username: z.string().min(4),
  email: z.email(),
});

// 2. Create the command — fully typed, self-validating, Standard Schema compatible
export class CreateUserCommand extends createCommand(schema) {}

// Usage:
// const cmd = new CreateUserCommand({ username: 'jane', email: 'jane@example.com' });
// cmd.username → 'jane'
// cmd.email    → 'jane@example.com'
// new CreateUserCommand({ username: 'ab', email: 'bad' }) → throws ZodValidationError
```

## 4. Write the Handler

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

This constructor helper is intentionally synchronous and therefore requires a
synchronous schema. For a schema with async refinements or transforms, build the
instance with the generated `parseAsync()` static instead — the behavior and the
pipe both run *after* construction, so they cannot rescue a constructor that
cannot complete:

```typescript
const command = await CreateUserCommand.parseAsync({ email, age });
```

You can also validate raw input up front, asynchronously, in
`ZodValidationBehavior` or in Nest's schema validation pipe rather than doing it
in a JavaScript constructor.

## 5. Wire Up the Controller

```typescript
// users.controller.ts
import { Body, Controller, Get, Param, Post, HttpCode } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';

const CreateUserDtoSchema = z.object({ name: z.string().min(5), email: z.email() });
type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

const UserIdSchema = z.uuid();

@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(201)
  async createUser(
    @Body({ schema: CreateUserDtoSchema }) dto: CreateUserDto,
  ) {
    return this.commandBus.execute(
      new CreateUserCommand({ username: dto.name, email: dto.email }),
    );
  }

  @Get(':id')
  async getUser(
    @Param('id', { schema: UserIdSchema }) id: string,
  ) {
    return this.queryBus.execute(new GetUserQuery({ userId: id }));
  }
}
```

## 6. Bootstrap the Application

```typescript
// main.ts
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // maps ZodValidationError → HTTP 400, replying through Nest's HTTP adapter
  app.useGlobalFilters(new ZodValidationFilter(app.get(HttpAdapterHost)));
  await app.listen(3000);
}
bootstrap();
```
