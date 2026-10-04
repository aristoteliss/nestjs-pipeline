---
title: "Πρώτα βήματα"
---

## 1. Εγκατάσταση

Απαιτείται **Node.js 22.12** ή νεότερο, **Nest 12.1** ή νεότερη έκδοση 12.x (`@nestjs/common`,
`@nestjs/core`) και **`@nestjs/cqrs` 12.1** ή νεότερη έκδοση 12.x.

```bash
# Βασικό NestJS CQRS και η μηχανή του pipeline
pnpm add @cqrs-ddd/nestjs @cqrs-ddd/pipeline @nestjs/cqrs @nestjs/common @nestjs/core reflect-metadata rxjs

# Προαιρετικά πακέτα behaviors
pnpm add @cqrs-ddd/pipeline-idempotency           # Deduplication & response replay (+ προαιρετικά redis/pg)
pnpm add @cqrs-ddd/pipeline-cache cache-manager keyv # Read-through query cache (+ προαιρετικά @keyv/redis, ...)
pnpm add @cqrs-ddd/pipeline-casl @casl/ability   # ABAC authorization με το CASL
pnpm add @cqrs-ddd/pipeline-audit                # Audit logging (προεπιλογή log sink; + προαιρετικά pg)
pnpm add @cqrs-ddd/pipeline-rate-limit rate-limiter-flexible # Quotas & rate limiting
pnpm add @cqrs-ddd/pipeline-resilience cockatiel # Retries, circuit breakers, timeouts, bulkheads
pnpm add @cqrs-ddd/pipeline-deadletter bullmq    # Dead-letter capture (ή amqplib / pg)
pnpm add @cqrs-ddd/pipeline-feature-flags @openfeature/server-sdk # Feature flag evaluations
pnpm add @cqrs-ddd/pipeline-opentelemetry @opentelemetry/api      # Distributed tracing & metrics
pnpm add @cqrs-ddd/pipeline-zod zod              # Schema validation
pnpm add @cqrs-ddd/pipeline-tenant               # Multi-tenant async context
pnpm add @cqrs-ddd/pipeline-correlation          # Request correlation ID context
pnpm add @cqrs-ddd/pipeline-job-context          # Async queue job context propagation
```

## 2. Δήλωση Module και Behavior Providers <a id="2-register-the-module"></a>

Στη νέα αρχιτεκτονική, τα behaviors είναι αποσυνδεδεμένες κλάσεις (`IPipelineBehavior`). Κάθε behavior δηλώνεται ως **τυπικός singleton provider** με token την κλάση του στο module που το ρυθμίζει. Το `PipelineModule.forRoot()` συντονίζει το καθολικό pipeline και τις πηγές context:

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
      // Πηγές ασύγχρονου context για tenant και correlation ID
      sources: { tenantId: tenantSource, correlationId: correlationSource },
      diagnostics: 'strict', // Αποτυγχάνει άμεσα κατά την εκκίνηση σε παραβιάσεις σειράς
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
    // Δήλωση των instances των behaviors ως singleton providers με βάση τα class tokens τους:
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
    // Διαδίδει τα headers x-correlation-id στο ασύγχρονο context
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
```

## 3. Ορισμός Command με Zod Validation

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

## 4. Υλοποίηση του CQRS Handler

Ο handler είναι ένας κλασικός `@nestjs/cqrs` handler διακοσμημένος με `@UsePipeline`:

```typescript
// create-user.handler.ts
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline, LoggingBehavior } from '@cqrs-ddd/pipeline';
import { CreateUserCommand } from './create-user.command.js';

@CommandHandler(CreateUserCommand)
@UsePipeline(
  // Υπερισχύει των καθολικών επιλογών του LoggingBehavior για αυτόν τον handler διατηρώντας την εξωτερική του θέση
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

## 5. Σύνδεση με τον Controller

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

## 6. Bootstrap με `ErrorFilter`

Στο `main.ts`, δηλώστε το `ErrorFilter` του `@cqrs-ddd/nestjs` (ή επεκτείνετέ το σε ένα `DomainExceptionFilter`). Μετατρέπει τα σφάλματα validation, τα pipeline contract exceptions, τα domain errors και τα concurrency conflicts σε τυπικές απαντήσεις HTTP του NestJS (`{ statusCode, error, message, ... }`):

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
