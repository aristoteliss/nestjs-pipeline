---
title: "Pipeline execution model"
sidebar:
  order: 1
---

```
┌─ global before ──┐   ┌── @UsePipeline ──┐   ┌─ global after ──┐
│ LoggingBehavior  │ → │ AuditBehavior    │ → │ TraceBehavior   │ → handler.execute()
│ ZodValidation    │   │ Idempotency      │   │ MetricsBehavior │
└──────────────────┘   └──────────────────┘   └─────────────────┘
                    ← response propagates back through the chain ←
```

## Bootstrap and Discovery Lifecycle

At application startup (`onApplicationBootstrap`), `PipelineBootstrap` (from `@cqrs-ddd/nestjs`) wires the pipeline:

1. **Handler Discovery**: Discovers all `@nestjs/cqrs` handlers registered in the Nest application container using Nest's `DiscoveryService`, reading metadata from `@CommandHandler`, `@QueryHandler`, and `@EventsHandler`.
2. **Static Dependency Tree Verification**: Verifies `provider.isDependencyTreeStatic()` on every handler that runs behaviors. If any handler or its injected dependencies are request-scoped (`Scope.REQUEST`), bootstrap throws immediately with a descriptive error. Handlers and behaviors must be singletons; per-request context is read through `AsyncLocalStorage` via configured `sources`.
3. **Behavior Provider Resolution**: Resolves each required behavior instance from the NestJS DI container under its behavior class token (e.g., `IdempotencyBehavior`). Fails fast if a required behavior has no provider or if multiple modules provide conflicting instances.
4. **Plan Compilation**: Compiles the execution plan once per handler (`compilePipelinePlan`), computing the ordered sequence: global `before` &rarr; `@UsePipeline` declared behaviors &rarr; global `after`.
5. **Contract Diagnostics**: When `diagnostics` is `'strict'` (default), runs `validateBehaviorContracts` to enforce architectural invariants (e.g. `CaslBehavior` must precede `CacheBehavior` and `IdempotencyBehavior`).
6. **Execution Wrapping**: Wraps the handler instance's `execute` method (or `handle` for event handlers) with the pre-compiled `PipelineRunner`. On application shutdown (`onModuleDestroy`), wrappers are cleanly restored.

## Runtime Invocation Lifecycle

When a caller dispatches through Nest's `CommandBus`, `QueryBus`, or `EventBus`:

1. **Context Creation**: The runner instantiates an `IPipelineContext` capturing the request instance, class constructor, handler type, timestamp, and an items bag.
2. **Context Sources**: Populates `correlationId` and `tenantId` by evaluating the configured `sources` functions within the current async execution context (`AsyncLocalStorage`).
3. **Onion Chain Execution**: Executes each behavior in sequence:
   - Outer behaviors run pre-processing logic before calling `next()`.
   - If an outer behavior short-circuits (e.g., `CacheBehavior` cache hit or `IdempotencyBehavior` replay), it returns the cached result without invoking subsequent behaviors or the handler.
   - Inner behaviors run, followed by the handler's business logic.
   - Post-processing logic executes in reverse order as responses or errors bubble back up.

## Execution Order

| Phase | Source | Position |
|---|---|---|
| Global `before` | `globalBehaviors.before` | Outermost (first to run) |
| Handler-level | `@UsePipeline(...)` | Middle |
| Global `after` | `globalBehaviors.after` | Innermost (closest to handler) |
| Handler | `execute()` / `handle()` | Core business logic |

## Deduplication and Same-Class Override

When both global and handler-level configurations include the same behavior class, the handler's complete options record wins while the behavior retains its global chain position. Global duplicates are deduplicated automatically.

```typescript
// Global config in PipelineModule.forRoot
PipelineModule.forRoot({
  globalBehaviors: [
    {
      scope: 'all',
      before: [
        [LoggingBehavior, { metricLogLevel: 'log', requestResponseLogLevel: 'debug' }],
      ],
    },
  ],
})

// Handler overrides LoggingBehavior options
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }], // ← wins over the global options
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  // ...
}

// Effective chain for CreateUserHandler:
//   [LoggingBehavior at global-before position, using handler options] → handler.execute()
```

Preserving the outer global position guarantees that mandatory cross-cutting policies (such as authentication or logging) cannot be moved behind caching or idempotency behaviors that might short-circuit before calling `next()`.
