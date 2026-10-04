---
title: "Αναφορά pipeline context"
sidebar:
  order: 2
---

## Ιδιότητες

Κάθε behavior λαμβάνει το `IPipelineContext`:

| Ιδιότητα | Τύπος | Περιγραφή |
|---|---|---|
| `correlationId` | `string` | Αμετάβλητο ID που ορίζεται πριν ξεκινήσει η αλυσίδα των behaviors |
| `tenantId` | `string \| undefined` | Ο τρέχων tenant κατά την εκκίνηση του pipeline· write-once |
| `request` | `TRequest` | Το instance command / query / event |
| `requestType` | `Type<TRequest>` | Ο constructor της κλάσης (π.χ. `CreateUserCommand`) |
| `requestName` | `string` | Το όνομα της κλάσης σε string (π.χ. `"CreateUserCommand"`) |
| `handlerType` | `Type` | Ο constructor της κλάσης του handler |
| `handlerName` | `string` | Το όνομα της κλάσης του handler (π.χ. `"CreateUserHandler"`) |
| `requestKind` | `'command' \| 'query' \| 'event' \| 'unknown'` | Εντοπίζεται αυτόματα από τα metadata του `@nestjs/cqrs` |
| `startedAt` | `Date` | UTC χρονοσήμανση εκκίνησης του pipeline |
| `response` | `TResponse \| undefined` | Ορίζεται αφού επιστρέψει το `next()`· `undefined` πριν εκτελεστεί ο handler |
| `items` | `Map<string \| symbol, unknown>` | Κοινόχρηστη συλλογή για επικοινωνία μεταξύ behaviors |

## Χρήση του `items` για επικοινωνία μεταξύ behaviors

```typescript
// AuthBehavior — εκτελείται πριν από άλλα behaviors
@Injectable()
export class AuthBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const userId = await this.authService.getCurrentUserId();
    context.items.set('currentUserId', userId);  // ← αποθήκευση δεδομένων
    return next();
  }
}

// AuditBehavior — εκτελείται μετά το AuthBehavior στην αλυσίδα
@Injectable()
export class AuditBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const result = await next();
    const userId = context.items.get('currentUserId');  // ← ανάγνωση δεδομένων
    await this.auditService.log({
      action: context.requestName,
      userId,
      correlationId: context.correlationId,
    });
    return result;
  }
}
```

## Επιλογές Behavior (Behavior Options)

Περάστε επιλογές ανά handler με τη μορφή πλειάδας `[Behavior, { ... }]` και διαβάστε τες με το `getBehaviorOptions()`:

```typescript
// Δήλωση στον Handler
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [AuditBehavior, { action: 'user.create', severity: 'high' }],
  [LoggingBehavior, { metricLogLevel: 'verbose', requestResponseLogLevel: 'log' }],
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  /* ... */
}

// Μέσα στο AuditBehavior
async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
  const opts = context.getBehaviorOptions<AuditOptions>(AuditBehavior);
  // opts → { action: 'user.create', severity: 'high' }
  // ...
}
```

Οι επιλογές μπορούν επίσης να οριστούν σε καθολικό επίπεδο:

```typescript
PipelineModule.forRoot({
  globalBehaviors: [
    {
      scope: 'all',
      before: [
        [LoggingBehavior, { metricLogLevel: 'log', requestResponseLogLevel: 'debug' }],
      ],
      after: [
        [TraceBehavior, { tracerName: 'my-service' }],
      ],
    },
  ],
})
```

Όταν το ίδιο behavior έχει επιλογές τόσο σε καθολικό επίπεδο όσο και σε επίπεδο handler, η δήλωση
του handler αντικαθιστά **ολόκληρη την εγγραφή επιλογών** ενώ το behavior διατηρεί
τη θέση του στην καθολική αλυσίδα. Ο πυρήνας δεν κάνει shallow-merge μεμονωμένων ιδιοτήτων
μέσα σε αυτές τις δύο εγγραφές.
