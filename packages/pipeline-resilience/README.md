# @nestjs-pipeline/resilience

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/resilience.svg)](https://www.npmjs.com/package/@nestjs-pipeline/resilience)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/resilience.svg)](https://www.npmjs.com/package/@nestjs-pipeline/resilience)

Resilience and transient-fault-handling for `@nestjs-pipeline/core`, powered by [cockatiel](https://www.npmjs.com/package/cockatiel), in two parts:

- **Named policies** for outbound dependencies — a payment API, an SMTP server, a partner webhook. Declare **retry**, **circuit breaker**, **timeout**, **bulkhead** and **fallback** once in the module; every adapter that calls the dependency shares the same policy, so one breaker tracks one dependency.
- **`ResilienceBehavior`** for the layers that make sense around a whole handler: **retry** (replaying the whole command), **timeout** and **bulkhead**.

---

## Table of Contents

- [Why](#why)
- [Where each layer belongs](#where-each-layer-belongs)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Named policies](#named-policies)
- [The pipeline behavior](#the-pipeline-behavior)
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
- [Behavior Contract & Bootstrap Diagnostics](#behavior-contract--bootstrap-diagnostics)
- [API Reference](#api-reference)
- [License](#license)

---

## Why

Distributed systems fail transiently: networks blip, dependencies stall, databases deadlock. Calling cockatiel directly works, but each adapter then builds and owns its own policy. This package declares policies **once, in the module**, validates them **at startup**, shares them **through dependency injection**, and names them in logs and telemetry — and it keeps the whole-handler layers declarative on the handler.

---

## Where each layer belongs

A layer protects either **one outbound call** (a named policy used by an adapter) or **one whole handler execution** (the pipeline behavior):

| Layer | Named policy (outbound call) | Pipeline behavior (whole handler) |
|---|---|---|
| Circuit breaker | ✔ one breaker per dependency, shared by every caller | ✘ a breaker per command would open for one command while the dependency fails for all |
| Fallback | ✔ a default value for one call | ✘ a canned result for a whole command hides a failed write |
| Retry | ✔ repeats only the call | ✔ repeats the whole command, e.g. to reload an aggregate after a transient conflict (`replaySafe` required for commands and events) |
| Timeout | ✔ bounds one call | ✔ bounds the whole handler |
| Bulkhead | ✔ limits concurrent calls to the dependency | ✔ limits concurrent executions of the handler |

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

```typescript
import { Module } from '@nestjs/common';
import { PipelineModule } from '@nestjs-pipeline/core';
import { ResilienceModule, ResilienceBehavior } from '@nestjs-pipeline/resilience';

@Module({
  imports: [
    ResilienceModule.forRoot({
      // Named policies for outbound dependencies, built once at startup.
      policies: {
        paymentsApi: {
          handle: (error) => error instanceof PaymentGatewayUnavailableError,
          retry: { maxAttempts: 2, backoff: { type: 'exponential' } },
          circuitBreaker: { halfOpenAfter: 30_000, breaker: { type: 'consecutive', threshold: 5 } },
          timeout: { duration: 3_000, strategy: 'cooperative' },
        },
      },
      // Optional defaults merged under every handler that attaches the behavior.
      defaults: { timeout: { duration: 10_000, strategy: 'cooperative' } },
    }),
    PipelineModule.forRoot({ behaviors: [ResilienceBehavior] }),
  ],
})
export class AppModule {}
```

### 2. Use the named policy in the outbound adapter

```typescript
import { Injectable } from '@nestjs/common';
import { ResiliencePolicies } from '@nestjs-pipeline/resilience';

@Injectable()
export class PaymentsClient {
  constructor(private readonly policies: ResiliencePolicies) {}

  charge(order: Order): Promise<Receipt> {
    // `signal` aborts on a cooperative timeout: pass it to the HTTP call.
    return this.policies.execute('paymentsApi', ({ signal }) =>
      this.http.post('/charges', order, { signal }),
    );
  }
}
```

Every handler that charges a card goes through `PaymentsClient`, so they all share one `paymentsApi` breaker: when the gateway fails, the circuit opens for all of them at once.

### 3. Attach the behavior to a handler (optional)

```typescript
import { CommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { resilience } from '@nestjs-pipeline/resilience';

@CommandHandler(DeleteUserCommand)
@UsePipeline(
  resilience({
    // Retry the whole command on a transient persistence conflict: the retry
    // reloads the aggregate and reruns the domain logic.
    handle: isTransientOperationError,
    retry: { maxAttempts: 3, replaySafe: true, backoff: { type: 'exponential', maxDelay: 100 } },
  }),
)
export class DeleteUserHandler { /* ... */ }
```

> The raw tuple form `@UsePipeline([ResilienceBehavior, { ... }])` remains supported as an escape hatch.

---

## Named policies

- **Declared once.** `ResilienceModule.forRoot({ policies })` takes `Record<string, ResiliencePolicyOptions>`: every layer, plus `handle`, `order` and `telemetry`.
- **Built at startup and shared.** `ResiliencePolicies` builds each policy when the application starts and returns the same instance to every caller, so circuit breaker and bulkhead state belong to the dependency.
- **Validated at startup.** A retry, circuit breaker or fallback without `handle` or `handleAllErrors: true`, or a policy with no layer, throws `ResiliencePolicyConfigurationError` during bootstrap.
- **No `replaySafe` needed.** A named policy repeats only the adapter's own call; whether that call is safe to repeat is the adapter's decision.
- **Named in logs and telemetry.** Log lines say `policy 'paymentsApi'`, and every telemetry event carries `policyName`.

Use the registry, or inject one policy:

```typescript
// The registry: every declared policy by name.
constructor(private readonly policies: ResiliencePolicies) {}
await this.policies.execute('paymentsApi', ({ signal }) => call(signal));
this.policies.get('paymentsApi'); // the shared cockatiel IPolicy

// One policy, injected by name.
constructor(@InjectResiliencePolicy('paymentsApi') private readonly policy: IPolicy) {}
await this.policy.execute(({ signal }) => call(signal));
```

An unknown name throws `ResiliencePolicyConfigurationError` listing the declared names.

**From configuration.** `forRootAsync` builds the options from injected dependencies. List the names you inject with `@InjectResiliencePolicy` in `policyNames`; every policy is available through `ResiliencePolicies` regardless:

```typescript
ResilienceModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    policies: {
      paymentsApi: {
        handleAllErrors: true,
        timeout: { duration: config.getOrThrow<number>('PAYMENTS_TIMEOUT_MS') },
        bulkhead: { limit: 20 },
      },
    },
  }),
  policyNames: ['paymentsApi'],
});
```

---

## The pipeline behavior

`ResilienceBehavior` wraps `next()` — the rest of the pipeline and the handler — in retry, bulkhead and timeout. Configured layers compose from outermost to innermost:

```
retry → bulkhead → timeout → handler
```

Each retry attempt is timed independently. Policies are built **lazily on first invocation and cached per handler**, so a bulkhead shares state across every request to that handler. When no options resolve, that result is cached and later invocations pass directly to `next()`.

The effective options for a handler are a **shallow merge** of the module `defaults` and the handler's own options (handler keys win).

A `circuitBreaker` or `fallback` on a handler is rejected at bootstrap: declare it on a named policy and use it in the adapter.

---

## Configuration

The layers below are available on named policies; the behavior accepts retry, timeout and bulkhead.

### Retry

On a named policy, retry repeats the outbound call. On the behavior, it re-runs all downstream behaviors and the handler; commands and events then require `retry.replaySafe: true`, queries do not. That flag is an explicit acknowledgment, not an idempotency mechanism: set it only when every downstream side effect tolerates replay (for example a version-conditioned write that reloads, or an external call deduplicated by a stable operation id).

```typescript
{
  handle: (error) => error instanceof TransientError,
  retry: {
    replaySafe: true, // behavior only, commands and events
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

**Named policies only.** Stops calling a failing dependency to let it recover. One breaker per policy, shared by every caller.

```typescript
policies: {
  paymentsApi: {
    handle: (error) => error instanceof TransientError,
    circuitBreaker: {
      halfOpenAfter: 10_000, // ms open before a trial call
      breaker: { type: 'consecutive', threshold: 5 },
    },
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

Signals timeout when a call or handler runs too long. Aggressive timeouts reject the attempt but cannot stop work already in progress; use cooperative timeouts and pass the signal to cancellable I/O when the work must stop — from `execute(({ signal }) => …)` on a named policy, or from `getResilienceAbortSignal()` inside a handler.

```typescript
{
  timeout: { duration: 2_000, strategy: 'cooperative' },
}
```

- `aggressive` (default): reject immediately with `TaskCancelledError`.
- `cooperative`: signal cancellation and wait for the work to settle.

On a `command` or `event` handler an `aggressive` timeout is a bootstrap diagnostic unless `timeout.replaySafe: true` acknowledges it: the caller is answered while the handler keeps running, so an outer retry, a released idempotency claim or a client retry can run the same side effect alongside it.

### Bulkhead

Limits concurrent in-flight executions to protect a scarce resource. Reused across invocations.

```typescript
{
  bulkhead: { limit: 10, queue: 5 },
}
```

When the limit (and optional `queue`) is exhausted, calls are rejected with `BulkheadRejectedError`.

### Fallback

**Named policies only.** Substitutes a value for one call when it fails (after all inner layers are exhausted).

```typescript
policies: {
  exchangeRates: {
    handle: (error) => error instanceof TransientError,
    fallback: { factory: () => lastKnownRates() },
  },
}
```

### Error selection (`handle`)

Retry, circuit breaker and fallback require an explicit `handle` predicate or `handleAllErrors: true`; configuration is rejected when neither is supplied. Prefer a predicate selecting only transient infrastructure errors, so validation, authorization and domain errors are neither retried nor counted as dependency failures:

```typescript
{
  handle: (error) => error instanceof TransientDbError,
  retry: { maxAttempts: 3 },
}
```

### Custom order

Override the composition order. Only listed *and* configured layers are wrapped. The default is `fallback → retry → circuitBreaker → bulkhead → timeout` (the behavior uses the retry, bulkhead and timeout part):

```typescript
{
  handle: (error) => error instanceof TransientError,
  retry: { maxAttempts: 3 },
  timeout: { duration: 1_000 },
  order: ['retry', 'timeout'], // retry wraps timeout
}
```

### Telemetry hooks

Observe policy events. Every hook receives an event carrying `policyName` (absent for a handler's policy):

```typescript
{
  telemetry: {
    onRetry: ({ attempt, policyName }) => metrics.increment('retry', { attempt, policyName }),
    onCircuitOpen: ({ policyName }) => metrics.increment('circuit.open', { policyName }),
    onCircuitClose: ({ policyName }) => metrics.increment('circuit.close', { policyName }),
    onCircuitHalfOpen: ({ policyName }) => metrics.increment('circuit.halfopen', { policyName }),
    onTimeout: ({ policyName }) => metrics.increment('timeout', { policyName }),
    onBulkheadRejected: ({ policyName }) => metrics.increment('bulkhead.rejected', { policyName }),
  },
}
```

The package also emits `debug`/`warn` log lines for these events.

### Escape hatch (`policy`)

Already have a hand-built cockatiel policy for a handler? Pass it directly and the behavior's declarative options are ignored:

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

## Behavior Contract & Bootstrap Diagnostics

`ResilienceBehavior` implements `@nestjs-pipeline/core` behavior contract diagnostics:

### Validation Invariants

- **No dependency layers on a handler**: `circuitBreaker` and `fallback` belong to named policies. Configuring either on the behavior fails at startup, with a fix pointing to `ResilienceModule.forRoot({ policies })`.
- **Error classification required**: a `retry` needs `handle: (error: unknown) => boolean` or `handleAllErrors: true`. Unspecified error handling fails fast at startup with `PipelineConfigurationError` in `strict` mode.
- **Non-query retry replay safety**: Retrying a handler repeats downstream execution and re-runs side effects. On `command` and `event` handlers, `retry` must declare `replaySafe: true` after verifying that downstream side effects are idempotent or transactional.
- **Module defaults resolution**: `defaults` supplied to `ResilienceModule.forRoot({ defaults })` are merged beneath handler options via `ResilienceBehavior.resolveEffectiveOptions` and evaluated during bootstrap diagnostics.

Named policies are validated separately, when `ResiliencePolicies` is created at startup (see [Named policies](#named-policies)).

---

## API Reference

### `ResilienceModule.forRoot({ defaults?, policies? })`

Returns a global `DynamicModule` that provides `ResilienceBehavior`, `ResiliencePolicies` and one injectable token per named policy. `defaults` apply only where `ResilienceBehavior` is attached.

### `ResilienceModule.forRootAsync({ imports?, inject?, useFactory, policyNames? })`

The same, with the options built by `useFactory` from injected dependencies. `policyNames` lists the policies injectable with `@InjectResiliencePolicy`.

### `ResiliencePolicies`

The registry of named policies: `names`, `get(name)` (the shared cockatiel `IPolicy`) and `execute(name, fn)`. Throws `ResiliencePolicyConfigurationError` at startup for an invalid policy and on `get`/`execute` for an unknown name.

### `@InjectResiliencePolicy(name)` / `getResiliencePolicyToken(name)`

Injects one named policy; the token is also usable in custom providers.

### `ResilienceBehavior`

The pipeline behavior. Resolves and caches a composed cockatiel policy per handler and executes the handler through it.

### `resilience(options)`

Type-safe intent builder returning `[ResilienceBehavior, options]` with compile-time validation ensuring at least one of `retry`, `timeout`, `bulkhead` or `policy` is configured. Accepts `ResilienceIntentOptions`.

### `ResilienceBehaviorOptions` / `ResiliencePolicyOptions`

The declarative configuration of a handler (`retry`, `bulkhead`, `timeout`, `handle`, `handleAllErrors`, `order`, `telemetry`, `policy`) and of a named policy (every layer, `handle`, `handleAllErrors`, `order`, `telemetry`).

### `buildResiliencePolicy(options, context)`

Low-level helper that composes a cockatiel `IPolicy` (or `null` when nothing is configured) from declarative options. Exposed for advanced/testing scenarios.

### Context Helpers & Tokens

- `getResilienceAbortSignal()` — returns the active attempt's `AbortSignal` for cooperative timeouts inside a handler.
- `RESILIENCE_DEFAULT_OPTIONS` — the token of the behavior defaults.

### Re-exported from cockatiel

Errors: `BrokenCircuitError`, `BulkheadRejectedError`, `IsolatedCircuitError`, `TaskCancelledError`. Guards: `isBrokenCircuitError`, `isBulkheadRejectedError`, `isIsolatedCircuitError`, `isTaskCancelledError`. Enum: `CircuitState`.

---

## License

Dual-licensed under **AGPLv3** (see [LICENSE](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE)) or a **Commercial License** (see [COMMERCIAL_LICENSE.txt](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)). Contact: aristotelis@ik.me
