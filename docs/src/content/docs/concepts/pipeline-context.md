---
title: "Pipeline context reference"
sidebar:
  order: 2
---

## Properties

Every behavior receives `IPipelineContext`:

| Property | Type | Description |
|---|---|---|
| `correlationId` | `string` | Immutable ID fixed before the behavior chain starts |
| `tenantId` | `string \| undefined` | Current tenant when the pipeline started; write-once |
| `request` | `TRequest` | The command / query / event instance |
| `requestType` | `Type<TRequest>` | Class constructor (e.g. `CreateUserCommand`) |
| `requestName` | `string` | Class name string (e.g. `"CreateUserCommand"`) |
| `handlerType` | `Type` | Handler class constructor |
| `handlerName` | `string` | Handler class name (e.g. `"CreateUserHandler"`) |
| `requestKind` | `'command' \| 'query' \| 'event' \| 'unknown'` | Auto-detected from `@nestjs/cqrs` metadata |
| `startedAt` | `Date` | UTC timestamp of pipeline start |
| `response` | `TResponse \| undefined` | Set after `next()` returns; `undefined` before handler runs |
| `items` | `Map<string \| symbol, unknown>` | Shared bag for inter-behavior communication |

## Using `items` for Inter-Behavior Communication

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

## Behavior Options

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

When the same behavior has options at both global and handler level, the handler
entry replaces its **whole options record** while the behavior retains its
global chain position. The core does not shallow-merge individual properties
inside those two records.
