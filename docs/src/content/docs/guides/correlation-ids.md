---
title: "Correlation IDs"
---

`@nestjs-pipeline/correlation` and `@nestjs-pipeline/tenant` each keep their value in
their own store and depend on no other pipeline package. Pass their stores to
`PipelineModule.forRoot({ sources: { tenantId: tenantSource, correlationId: correlationSource } })`,
and a pipeline takes both when it starts: `context.correlationId` is the current ID or a new
one from `correlationSource.create()`, and `context.tenantId` is the current tenant
(write-once). The behaviors and
handler run inside both values, so a saga, an event published with `eventBus.publish()` or a nested
`CommandBus.execute()` inherits them, and `getCorrelationId()` in a handler equals
`context.correlationId`. Set the values where work enters, with `HttpCorrelationMiddleware` or `runWithCorrelationId` of
`@nestjs-pipeline/correlation` and `runWithTenant` of `@nestjs-pipeline/tenant`.

## HTTP Requests

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

The pipeline `context.correlationId` will be `"req-abc-123"` for the entire chain. If the header is omitted or malformed (over 128 characters, or characters outside `DEFAULT_CORRELATION_ID_PATTERN`), a new ID is generated.

## Bull Queue Processor

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

## RabbitMQ Handler

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

## Cron Jobs

```typescript
import { uuidv7 } from '@cqrs-ddd/uuidv7';
import { runWithCorrelationId } from '@nestjs-pipeline/correlation';
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

## Nested Commands (Sagas)

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

## @WithCorrelation Decorator

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

## Producer-Side: Stamping Correlation IDs

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
const id = getCorrelationId(); // the current ID, or a new one when none is set
```
