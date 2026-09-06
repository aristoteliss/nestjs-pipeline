# @nestjs-pipeline/resilience

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/resilience.svg)](https://www.npmjs.com/package/@nestjs-pipeline/resilience)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/resilience.svg)](https://www.npmjs.com/package/@nestjs-pipeline/resilience)

Resilience and transient-fault-handling behavior for `@nestjs-pipeline/core`, powered by [cockatiel](https://www.npmjs.com/package/cockatiel). Wrap any command, query, or event handler in **retry**, **circuit breaker**, **timeout**, **bulkhead**, and **fallback** policies — declaratively, with zero changes to your handler code.

---

## Table of Contents

- [Why](#why)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [1. Register the module](#1-register-the-module)
  - [2. Attach the behavior](#2-attach-the-behavior)
  - [3. Configure per handler](#3-configure-per-handler)
- [How It Works](#how-it-works)
  - [Composition order](#composition-order)
  - [Per-handler caching](#per-handler-caching)
  - [Options resolution](#options-resolution)
- [Configuration](#configuration)
  - [Retry](#retry)
  - [Circuit Breaker](#circuit-breaker)
  - [Timeout](#timeout)
  - [Bulkhead](#bulkhead)
  - [Fallback](#fallback)
  - [Error selection (`handle`)](#error-selection-handle)
  - [Custom order](#custom-order)
  - [Telemetry hooks](#telemetry-hooks)
  - [Escape hatch (`policy`)](#escape-hatch-policy)
- [Handling Resilience Errors](#handling-resilience-errors)
- [Custom Logger](#custom-logger)
- [Full Example](#full-example)
- [API Reference](#api-reference)
- [License](#license)

---

## Why

Distributed systems fail transiently: networks blip, dependencies stall, databases deadlock. `@nestjs-pipeline/resilience` adds battle-tested resilience patterns to your CQRS pipeline without coupling the patterns to your business logic. It's a thin, type-safe behavior layer over [cockatiel](https://github.com/connor4312/cockatiel) — the same resilience engine VS Code uses internally.

---

## Installation

```bash
pnpm add @nestjs-pipeline/resilience cockatiel
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common reflect-metadata
```

> **Note:** This package targets **cockatiel `^3.2.1`** (CommonJS). cockatiel `4.x` is published as an ESM-only module and is not compatible with a CommonJS NestJS build.

---

## Quick Start

### 1. Register the module

`ResilienceModule.forRoot()` registers `ResilienceBehavior` and, optionally,
application-wide default options. Those defaults are used by handlers where
`ResilienceBehavior` is actually attached; module registration by itself does not
wrap every handler.

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule } from '@nestjs-pipeline/core';
import { ResilienceModule, ResilienceBehavior } from '@nestjs-pipeline/resilience';

@Module({
  imports: [
    CqrsModule.forRoot(),
    ResilienceModule.forRoot({
      // Defaults merged under attached handlers (handler options win).
      timeout: { duration: 5_000 },
    }),
    PipelineModule.forRoot({
      globalBehaviors: {
        scope: 'all',
        after: [ResilienceBehavior],
      },
    }),
  ],
})
export class AppModule {}
```

### 2. Attach the behavior

Attach `ResilienceBehavior` globally (as above) or to specific handlers. Either way, options are resolved per handler.

### 3. Configure per handler

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';

@CommandHandler(ChargeCardCommand)
@UsePipeline([
  ResilienceBehavior,
  {
    retry: { maxAttempts: 3, backoff: { type: 'exponential' } },
    circuitBreaker: {
      halfOpenAfter: 10_000,
      breaker: { type: 'consecutive', threshold: 5 },
    },
    timeout: { duration: 2_000 },
  },
])
export class ChargeCardHandler implements ICommandHandler<ChargeCardCommand> {
  async execute(command: ChargeCardCommand): Promise<Receipt> {
    return this.gateway.charge(command);
  }
}
```

---

## How It Works

### Composition order

Configured layers are wrapped from **outermost** (runs first) to **innermost** (closest to the handler):

```
fallback → retry → circuitBreaker → bulkhead → timeout → handler
```

This default order is intentional:

- **fallback** is outermost so it catches a failure from *any* inner layer.
- **retry** sits above the **circuit breaker** so each retry attempt is observed by the breaker.
- **timeout** is innermost so it bounds a single handler invocation (and each retry attempt is independently timed).

Only the layers you configure are applied — everything else is skipped. Override the order with the [`order`](#custom-order) option.

### Per-handler caching

Policies are built **lazily on first invocation and cached per handler**. This is essential for **stateful** layers: a circuit breaker or bulkhead must share state across every request to a handler. When no options resolve for a handler, that no-policy result is cached and later invocations pass directly to `next()` without constructing or executing a cockatiel policy.

### Options resolution

For each handler where `ResilienceBehavior` is attached, the effective options are a **shallow merge** of:

1. Application-wide defaults from `ResilienceModule.forRoot({ ... })`.
2. Per-handler options from `@UsePipeline([ResilienceBehavior, { ... }])` (these win).

---

## Configuration

### Retry

Re-runs the handler on a handled failure.

```typescript
{
  retry: {
    maxAttempts: 3, // retry attempts after the initial call (up to 4 executions total)
    backoff: { type: 'exponential', initialDelay: 128, maxDelay: 30_000, jitter: 'decorrelated' },
  },
}
```

Backoff strategies:

| Strategy | Shape | Behavior |
|---|---|---|
| `constant` | `{ type: 'constant', delay }` | Fixed `delay` (ms) between attempts. |
| `exponential` | `{ type: 'exponential', initialDelay?, maxDelay?, exponent?, jitter? }` | Exponential growth with jitter. Defaults: `initialDelay: 128`, `maxDelay: 30_000`, `exponent: 2`. |
| `iterable` | `{ type: 'iterable', delays }` | Walk an explicit `delays` list; the last value repeats. |

Jitter strategies for `exponential`: `decorrelated` (default, recommended), `full`, `half`, `none`.

### Circuit Breaker

Stops calling a failing dependency to let it recover. Reused across invocations to preserve state.

```typescript
{
  circuitBreaker: {
    halfOpenAfter: 10_000, // ms open before a trial call
    breaker: { type: 'consecutive', threshold: 5 },
  },
}
```

Breaker strategies:

| Strategy | Shape | Opens when… |
|---|---|---|
| `consecutive` | `{ type: 'consecutive', threshold }` | `threshold` failures occur in a row. |
| `sampling` | `{ type: 'sampling', threshold, duration, minimumRps? }` | Failure proportion (`0–1`) exceeds `threshold` within a rolling `duration` (ms) window. |
| `count` | `{ type: 'count', threshold, size, minimumNumberOfCalls? }` | Failure proportion exceeds `threshold` over the last `size` calls. |

### Timeout

Signals timeout when a handler runs too long. Aggressive timeouts reject the
attempt but cannot stop arbitrary work already in progress; use cooperative
timeouts with `getResilienceAbortSignal()` and pass the signal to cancellable
I/O when underlying work must stop.

```typescript
{
  timeout: { duration: 2_000, strategy: 'aggressive' },
}
```

- `aggressive` (default): reject immediately with `TaskCancelledError`.
- `cooperative`: signal cancellation and wait for the handler to settle.

### Bulkhead

Limits concurrent in-flight executions to protect a scarce resource. Reused across invocations.

```typescript
{
  bulkhead: { limit: 10, queue: 5 },
}
```

When the limit (and optional `queue`) is exhausted, calls are rejected with `BulkheadRejectedError`.

### Fallback

Substitutes a value when execution fails (after all inner layers are exhausted).

```typescript
{ fallback: { value: { status: 'degraded' } } }
// or lazily:
{ fallback: { factory: () => buildDefaultResponse() } }
```

### Error selection (`handle`)

By default **all** errors are handled (eligible for retry/fallback and counted by the breaker). Narrow this with a predicate:

```typescript
{
  handle: (error) => error instanceof TransientDbError,
  retry: { maxAttempts: 3 },
}
```

### Custom order

Override the composition order. Only listed *and* configured layers are wrapped:

```typescript
{
  retry: { maxAttempts: 3 },
  timeout: { duration: 1_000 },
  order: ['retry', 'timeout'], // retry wraps timeout
}
```

### Telemetry hooks

Observe policy events (fired per handler, since policies are cached):

```typescript
{
  retry: { maxAttempts: 3 },
  circuitBreaker: { halfOpenAfter: 5_000, breaker: { type: 'consecutive', threshold: 3 } },
  telemetry: {
    onRetry: ({ attempt, delay }) => metrics.increment('retry', { attempt }),
    onCircuitOpen: () => metrics.increment('circuit.open'),
    onCircuitClose: () => metrics.increment('circuit.close'),
    onCircuitHalfOpen: () => metrics.increment('circuit.halfopen'),
    onTimeout: () => metrics.increment('timeout'),
    onBulkheadRejected: () => metrics.increment('bulkhead.rejected'),
  },
}
```

The behavior also emits `debug`/`warn` log lines for these events via its logger.

### Escape hatch (`policy`)

Already have a hand-built cockatiel policy? Pass it directly and all declarative options are ignored:

```typescript
import { wrap, retry, handleAll, ExponentialBackoff } from 'cockatiel';

const myPolicy = wrap(retry(handleAll, { maxAttempts: 3, backoff: new ExponentialBackoff() }));

@UsePipeline([ResilienceBehavior, { policy: myPolicy }])
```

---

## Handling Resilience Errors

The most useful cockatiel error types and enums are re-exported so you can react to resilience outcomes without importing `cockatiel` directly:

```typescript
import {
  BrokenCircuitError,
  BulkheadRejectedError,
  IsolatedCircuitError,
  TaskCancelledError,
  CircuitState,
} from '@nestjs-pipeline/resilience';

try {
  await commandBus.execute(new ChargeCardCommand(/* … */));
} catch (error) {
  if (error instanceof BrokenCircuitError) {
    // Circuit is open — fail fast / return a cached value.
  } else if (error instanceof TaskCancelledError) {
    // The handler timed out.
  } else if (error instanceof BulkheadRejectedError) {
    // Too many concurrent calls.
  }
}
```

Type guards (`isBrokenCircuitError`, `isBulkheadRejectedError`, `isIsolatedCircuitError`, `isTaskCancelledError`) are also re-exported.

---

## Custom Logger

`ResilienceBehavior` accepts a custom Nest `LoggerService` via the `LOGGING_BEHAVIOR_LOGGER` token (useful with `nestjs-pino`):

```typescript
import { Module } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { LOGGING_BEHAVIOR_LOGGER } from '@nestjs-pipeline/core';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';

@Module({
  providers: [
    ResilienceBehavior,
    { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: Logger },
  ],
})
export class AppModule {}
```

If no logger is provided, a default Nest `Logger` scoped to `ResilienceBehavior` is used.

---

## Full Example

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';

@CommandHandler(SyncInventoryCommand)
@UsePipeline([
  ResilienceBehavior,
  {
    // Only retry transient infrastructure errors.
    handle: (error) => error instanceof TransientError,
    retry: {
      maxAttempts: 4,
      backoff: { type: 'exponential', initialDelay: 200, maxDelay: 5_000 },
    },
    circuitBreaker: {
      halfOpenAfter: 15_000,
      breaker: { type: 'sampling', threshold: 0.5, duration: 30_000, minimumRps: 5 },
    },
    bulkhead: { limit: 20, queue: 10 },
    timeout: { duration: 3_000 },
    fallback: { factory: () => ({ synced: false, reason: 'degraded' }) },
    telemetry: {
      onCircuitOpen: () => alerting.page('inventory circuit open'),
    },
  },
])
export class SyncInventoryHandler implements ICommandHandler<SyncInventoryCommand> {
  async execute(command: SyncInventoryCommand) {
    return this.warehouse.sync(command.sku);
  }
}
```

---

## API Reference

### `ResilienceModule.forRoot(defaultOptions?)`

Returns a global `DynamicModule` that provides `ResilienceBehavior` and binds `defaultOptions` to the `RESILIENCE_DEFAULT_OPTIONS` token. These defaults affect handlers only when `ResilienceBehavior` is attached to their pipeline.

### `ResilienceBehavior`

The pipeline behavior. Resolves and caches a composed cockatiel policy per handler and executes the handler through it.

### `ResilienceBehaviorOptions`

The declarative configuration object (see [Configuration](#configuration)): `retry`, `circuitBreaker`, `bulkhead`, `timeout`, `fallback`, `handle`, `order`, `telemetry`, `policy`.

### `buildResiliencePolicy(options, context)`

Low-level helper that composes a cockatiel `IPolicy` (or `null` when nothing is configured) from `ResilienceBehaviorOptions`. Exposed for advanced/testing scenarios.

### Context Helpers & Tokens

- `getResilienceAbortSignal()` — returns the active attempt's `AbortSignal` for cooperative timeouts.
- `RESILIENCE_ABORT_SIGNAL_ITEM` — exported unique `Symbol` context key for the abort signal.

### Re-exported from cockatiel


Errors: `BrokenCircuitError`, `BulkheadRejectedError`, `IsolatedCircuitError`, `TaskCancelledError`. Guards: `isBrokenCircuitError`, `isBulkheadRejectedError`, `isIsolatedCircuitError`, `isTaskCancelledError`. Enum: `CircuitState`.

---

## License

Dual-licensed under **AGPLv3** (see [LICENSE](../../LICENSE)) or a **Commercial License** (see [COMMERCIAL_LICENSE.txt](../../COMMERCIAL_LICENSE.txt)). Contact: aristotelis@ik.me
