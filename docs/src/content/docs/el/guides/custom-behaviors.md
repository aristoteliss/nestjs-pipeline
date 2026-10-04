---
title: "Δημιουργία custom behaviors"
---

Κάθε behavior υλοποιεί το interface `IPipelineBehavior` — μία ενιαία μέθοδο `handle(context, next)`:

```typescript
import { Injectable } from '@nestjs/common';
import {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@nestjs-pipeline/core';

@Injectable()
export class MyBehavior implements IPipelineBehavior {
  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<any> {
    // ── BEFORE the handler ──
    // Access context.request, context.correlationId, context.requestKind, etc.

    const result = await next(); // call the next behavior in the chain (or the handler)

    // ── AFTER the handler ──
    // Access context.response (set automatically after the handler returns)

    return result;
  }
}
```

## Παράδειγμα: Metrics Behavior <a id="example-metrics-behavior"></a>

> **Συμβουλή:** Ένα metrics behavior έτοιμο για περιβάλλον παραγωγής παρέχεται ήδη στο [`@nestjs-pipeline/opentelemetry`](/nestjs-pipeline/packages/nestjs-pipeline/opentelemetry/) (`MetricsBehavior`, βασισμένο στο OTel Metrics API). Το παρακάτω παράδειγμα αποτελεί μια εκ του μηδενός απεικόνιση για οποιοδήποτε custom backend μετρήσεων.

```typescript
import { Injectable } from '@nestjs/common';
import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

@Injectable()
export class MetricsBehavior implements IPipelineBehavior {
  constructor(private readonly metricsService: MetricsService) {}

  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const start = performance.now();
    const labels = {
      kind: context.requestKind,     // 'command' | 'query' | 'event'
      name: context.requestName,     // 'CreateUserCommand'
      handler: context.handlerName,  // 'CreateUserHandler'
    };

    try {
      const result = await next();
      const durationMs = performance.now() - start;
      this.metricsService.recordDuration('pipeline.duration_ms', durationMs, labels);
      this.metricsService.incrementCounter('pipeline.success', labels);
      return result;
    } catch (error) {
      const durationMs = performance.now() - start;
      this.metricsService.recordDuration('pipeline.duration_ms', durationMs, labels);
      this.metricsService.incrementCounter('pipeline.failure', labels);
      throw error;
    }
  }
}
```

## Παράδειγμα: Audit-Trail Behavior με Επιλογές <a id="example-audit-trail-behavior-with-options"></a>

Περάστε επιλογές ανά handler μέσω της μορφής tuple `[Behavior, { ... }]` και διαβάστε τις με τη μέθοδο `getBehaviorOptions()`:

```typescript
// audit.behavior.ts
import { Injectable } from '@nestjs/common';
import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

export interface AuditOptions {
  action: string;
  severity?: 'low' | 'medium' | 'high';
}

@Injectable()
export class AuditBehavior implements IPipelineBehavior {
  constructor(private readonly auditService: AuditService) {}

  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const result = await next();

    // Read handler-specific options from @UsePipeline([AuditBehavior, { ... }])
    const opts = context.getBehaviorOptions<AuditOptions>(AuditBehavior);
    if (opts) {
      await this.auditService.log({
        action: opts.action,
        severity: opts.severity ?? 'medium',
        correlationId: context.correlationId,
        requestKind: context.requestKind,
        requestName: context.requestName,
        handler: context.handlerName,
        timestamp: context.startedAt,
        payload: context.request,
      });
    }

    return result;
  }
}

// create-user.handler.ts — handler-level options
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [AuditBehavior, { action: 'user.create', severity: 'high' }],
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand): Promise<User> { /* ... */ }
}

// delete-order.handler.ts — different options for a different handler
@CommandHandler(DeleteOrderCommand)
@UsePipeline(
  [AuditBehavior, { action: 'order.delete', severity: 'high' }],
)
export class DeleteOrderHandler implements ICommandHandler<DeleteOrderCommand> {
  async execute(command: DeleteOrderCommand): Promise<void> { /* ... */ }
}
```

## Παράδειγμα: Caching Behavior <a id="example-caching-behavior"></a>

Αποτελεί μόνο μια ελάχιστη απεικόνιση: το κλειδί του δεν διαθέτει scope για tenant, principal ή δικαιώματα, επομένως μπορεί να επιστρέψει την απάντηση ενός καλούντος σε κάποιον άλλον. Χρησιμοποιήστε το `@nestjs-pipeline/cache` με το `createPartitionedCacheKeyFactory` για πραγματικούς handlers.

```typescript
import { Injectable } from '@nestjs/common';
import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

@Injectable()
export class CachingBehavior implements IPipelineBehavior {
  constructor(private readonly cache: CacheService) {}

  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    // Only cache queries — commands and events always execute
    if (context.requestKind !== 'query') {
      return next();
    }

    const cacheKey = `${context.requestName}:${JSON.stringify(context.request)}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await next();
    await this.cache.set(cacheKey, result, { ttl: 60 });
    return result;
  }
}
```

## Παράδειγμα: Retry Behavior <a id="example-retry-behavior"></a>

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

@Injectable()
export class RetryBehavior implements IPipelineBehavior {
  private readonly logger = new Logger(RetryBehavior.name);

  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const maxRetries = 3;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await next();
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `[${context.correlationId}] ${context.requestName} ` +
          `attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
        );
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 100 * attempt));
        }
      }
    }

    throw lastError!;
  }
}
```

## Δήλωση Behaviors <a id="registering-behaviors"></a>

```typescript
// ── Global: auto-wraps all commands, queries, and events ──
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [MetricsBehavior, LoggingBehavior, ZodValidationBehavior],
  },
})

// ── Scoped global: only commands ──
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'commands',
    before: [AuditBehavior],
  },
})

// ── Per-kind scoping with array form ──
PipelineModule.forRoot({
  globalBehaviors: [
    { scope: 'commands', before: [AuditBehavior] },
    { scope: 'queries',  before: [CachingBehavior] },
    { scope: 'all',      after:  [LoggingBehavior] },
  ],
})

// ── Per-handler: override or add behaviors for specific handlers ──
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [AuditBehavior, { action: 'user.create' }],
)
export class CreateUserHandler { /* ... */ }

// ── Feature module: register feature-owned behaviors application-wide ──
@Module({
  imports: [PipelineModule.forFeature([AuditBehavior, CachingBehavior])],
})
export class AuditModule {}
```

Το `PipelineModule` είναι καθολικό (global), επομένως το `forFeature()` καταγράφει πού ανήκουν οι behavior providers αλλά δεν τους απομονώνει στην ιεραρχία module αυτού του feature. Μόλις γίνει import το feature, τα δηλωμένα behaviors είναι ανιχνεύσιμα (discoverable) από το `@UsePipeline()` σε ολόκληρη την εφαρμογή.
