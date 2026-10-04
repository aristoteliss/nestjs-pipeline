---
title: "Correlation IDs"
---

Τα πακέτα `@nestjs-pipeline/correlation` και `@nestjs-pipeline/tenant` διατηρούν το καθένα την τιμή του στο δικό του store και δεν εξαρτώνται από κανένα άλλο πακέτο του pipeline. Περάστε τα stores τους στο
`PipelineModule.forRoot({ sources: { tenantId: tenantSource, correlationId: correlationSource } })`,
και το pipeline λαμβάνει και τα δύο κατά την εκκίνησή του: το `context.correlationId` είναι το τρέχον ID ή ένα νέο από το `correlationSource.create()`, και το `context.tenantId` είναι ο τρέχων tenant (write-once). Τα behaviors και ο handler εκτελούνται εντός και των δύο αυτών τιμών, επομένως ένα saga, ένα event που δημοσιεύεται με το `eventBus.publish()` ή ένα ένθετο `CommandBus.execute()` τα κληρονομεί, και η κλήση `getCorrelationId()` μέσα σε έναν handler ισούται με το `context.correlationId`. Ορίστε τις τιμές εκεί όπου εισέρχεται η εργασία, με το `HttpCorrelationMiddleware` ή το `runWithCorrelationId` του `@nestjs-pipeline/correlation` και το `runWithTenant` του `@nestjs-pipeline/tenant`.

## Αιτήματα HTTP <a id="http-requests"></a>

Εγκαταστήστε το `@nestjs-pipeline/correlation` και εφαρμόστε το `HttpCorrelationMiddleware` για την εξαγωγή των correlation IDs από τις HTTP κεφαλίδες:

```typescript
import { HttpCorrelationMiddleware } from '@nestjs-pipeline/correlation';

@Module({ /* ... */ })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}
```

Στη συνέχεια στείλτε την κεφαλίδα:

```bash
curl -X POST http://localhost:3000/users \
  -H 'x-correlation-id: req-abc-123' \
  -H 'Content-Type: application/json' \
  -d '{"name": "Jane", "email": "jane@example.com"}'
```

Το `context.correlationId` του pipeline θα είναι `"req-abc-123"` για ολόκληρη την αλυσίδα. Εάν η κεφαλίδα παραλειφθεί ή δεν είναι έγκυρη (πάνω από 128 χαρακτήρες, ή χαρακτήρες εκτός του `DEFAULT_CORRELATION_ID_PATTERN`), παράγεται ένα νέο ID.

## Bull Queue Processor <a id="bull-queue-processor"></a>

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

## RabbitMQ Handler <a id="rabbitmq-handler"></a>

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

## Εργασίες Cron <a id="cron-jobs"></a>

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

## Ένθετα Commands (Sagas) <a id="nested-commands-sagas"></a>

Τα sagas **δεν** χρειάζονται `@UsePipeline`. Τα commands που εκπέμπονται από ένα saga διέρχονται μέσω του `CommandBus` και συναντούν αυτόματα το pipeline του handler προορισμού. Το θυγατρικό pipeline κληρονομεί τα `correlationId` και `tenantId` του γονέα μέσω `AsyncLocalStorage`:

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

## Decorator @WithCorrelation <a id="withcorrelation-decorator"></a>

Αντί να καλείτε χειροκίνητα το `runWithCorrelationId`, χρησιμοποιήστε τον method decorator `@WithCorrelation()` για μια πιο καθαρή προσέγγιση. Τυλίγει αυτόματα το σώμα της μεθόδου σε ένα correlation context:

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

## Πλευρά Παραγωγού (Producer): Σήμανση Correlation IDs <a id="producer-side-stamping-correlation-ids"></a>

Κατά την εισαγωγή εργασιών σε ουρές ή τη δημοσίευση μηνυμάτων, σημειώστε το τρέχον correlation ID στο payload ή στις κεφαλίδες:

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
