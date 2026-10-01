---
title: "Pipeline execution model"
sidebar:
  order: 1
---

```
┌─ global before ──┐   ┌── @UsePipeline ──┐   ┌─ global after ──┐
│ LoggingBehavior  │ → │ AuditBehavior    │ → │ TraceBehavior   │ → handler.execute()
│ ZodValidation    │   │                  │   │ MetricsBehavior │
└──────────────────┘   └──────────────────┘   └─────────────────┘
                    ← response propagates back through the chain ←
```

1. At startup the pipeline finds the CQRS handlers through Nest's `DiscoveryService`, by the metadata their `@CommandHandler`, `@QueryHandler` and `@EventsHandler` decorators record.
2. For each matching handler it precomputes request-independent metadata and resolves singleton behavior instances. Behaviors that cannot be resolved as singletons are marked for per-invocation resolution.
3. Per invocation: creates a `PipelineContext`, resolves any dynamic/request-scoped/transient behaviors with the applicable Nest context ID, takes the tenant and correlation id from the configured `sources`, and runs the chain inside them (and `AsyncLocalStorage`) so nested dispatches inherit them.
4. The common all-singleton path reuses the pre-resolved instances with no request-time reflection or behavior DI lookup; scoped/dynamic behaviors intentionally use request-time DI resolution.
5. Requires Nest and Nest CQRS 12. Request-scoped and transient handlers
   (`Scope.REQUEST`, `Scope.TRANSIENT`) rely on `AsyncContext`, which earlier
   CQRS versions do not provide.

## Execution Order

| Phase | Source | Position |
|---|---|---|
| Global `before` | `globalBehaviors.before` | Outermost (first to run) |
| Handler-level | `@UsePipeline(...)` | Middle |
| Global `after` | `globalBehaviors.after` | Innermost (closest to handler) |
| Handler | `execute()` / `handle()` | Core |

## Deduplication

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
