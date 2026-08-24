/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import type { IPolicy } from 'cockatiel';

/**
 * The resilience layers that can be composed, listed from **outermost**
 * (runs first / wraps everything) to **innermost** (closest to the handler).
 *
 * The default composition order is:
 * `fallback → retry → circuitBreaker → bulkhead → timeout → handler`.
 */
export type ResilienceLayer =
  | 'fallback'
  | 'retry'
  | 'circuitBreaker'
  | 'bulkhead'
  | 'timeout';

/** Jitter strategy used by the exponential backoff generator. */
export type JitterStrategy = 'decorrelated' | 'none' | 'full' | 'half';

/** Backoff strategy controlling the delay between retry attempts. */
export type RetryBackoff =
  /** Wait a fixed `delay` (ms) between every attempt. */
  | { type: 'constant'; delay: number }
  /**
   * Decorrelated-jitter exponential backoff (recommended). All fields are
   * optional and fall back to cockatiel's defaults
   * (`initialDelay: 128`, `maxDelay: 30_000`, `exponent: 2`).
   */
  | {
      type: 'exponential';
      initialDelay?: number;
      maxDelay?: number;
      exponent?: number;
      jitter?: JitterStrategy;
    }
  /** Walk through an explicit list of delays (ms); the last value repeats. */
  | { type: 'iterable'; delays: number[] };

/** Retry configuration — re-runs the handler on a handled failure. */
export interface RetryOptions {
  /** Maximum number of attempts before giving up (e.g. `3`). */
  maxAttempts: number;
  /** Delay strategy between attempts. Defaults to no delay. */
  backoff?: RetryBackoff;
}

/** Circuit breaker strategy controlling when the circuit opens. */
export type BreakerStrategy =
  /** Open after `threshold` consecutive failures. */
  | { type: 'consecutive'; threshold: number }
  /**
   * Open when the failure proportion exceeds `threshold` (0–1) within a
   * rolling `duration` (ms) window. `minimumRps` avoids tripping under low load.
   */
  | {
      type: 'sampling';
      threshold: number;
      duration: number;
      minimumRps?: number;
    }
  /**
   * Open when the failure proportion exceeds `threshold` (0–1) over the last
   * `size` calls (count-based sliding window).
   */
  | {
      type: 'count';
      threshold: number;
      size: number;
      minimumNumberOfCalls?: number;
    };

/** Circuit breaker configuration. */
export interface CircuitBreakerOptions {
  /**
   * Milliseconds the circuit stays open before allowing a trial (half-open)
   * call through.
   */
  halfOpenAfter: number;
  /** The breaker policy controlling when the circuit trips. */
  breaker: BreakerStrategy;
}

/** Timeout configuration — aborts a handler that runs too long. */
export interface TimeoutOptions {
  /** Duration in milliseconds after which the call times out. */
  duration: number;
  /**
   * - `aggressive` (default): reject immediately with `TaskCancelledError`.
   * - `cooperative`: signal cancellation and wait for the handler to settle.
   */
  strategy?: 'aggressive' | 'cooperative';
}

/** Bulkhead configuration — limits concurrent in-flight executions. */
export interface BulkheadOptions {
  /** Maximum number of concurrent executions. */
  limit: number;
  /** Optional number of queued executions allowed beyond `limit`. */
  queue?: number;
}

/** Fallback configuration — substitutes a value when execution fails. */
export type FallbackOptions =
  /** Return a static `value` when a handled failure occurs. */
  | { value: unknown }
  /** Lazily produce a value when a handled failure occurs. */
  | { factory: () => unknown };

/**
 * Optional telemetry hooks fired by the underlying cockatiel policies.
 *
 * These are attached once per handler (policies are built lazily and cached so
 * circuit-breaker / bulkhead state is preserved across invocations), therefore
 * they are scoped to the handler rather than to a single request.
 */
export interface ResilienceTelemetry {
  /** Fired before each retry, with the upcoming attempt number and delay (ms). */
  onRetry?(event: { attempt: number; delay: number }): void;
  /** Fired when the circuit breaker opens (trips). */
  onCircuitOpen?(): void;
  /** Fired when the circuit breaker closes (recovers). */
  onCircuitClose?(): void;
  /** Fired when the circuit breaker enters the half-open trial state. */
  onCircuitHalfOpen?(): void;
  /** Fired when a timeout is reached. */
  onTimeout?(): void;
  /** Fired when the bulkhead rejects a call (capacity + queue exhausted). */
  onBulkheadRejected?(): void;
}

/**
 * Per-handler (or global default) resilience configuration.
 *
 * Compose any subset of the layers below; only the ones you set are applied.
 * Supply via `@UsePipeline([ResilienceBehavior, { ... }])` for a handler, or via
 * `ResilienceModule.forRoot({ ... })` as application-wide defaults.
 *
 * @example
 * ```ts
 * @CommandHandler(ChargeCardCommand)
 * @UsePipeline([ResilienceBehavior, {
 *   retry: { maxAttempts: 3, backoff: { type: 'exponential' } },
 *   circuitBreaker: { halfOpenAfter: 10_000, breaker: { type: 'consecutive', threshold: 5 } },
 *   timeout: { duration: 2_000 },
 * }])
 * export class ChargeCardHandler implements ICommandHandler<ChargeCardCommand> {}
 * ```
 */
export interface ResilienceBehaviorOptions {
  /** Retry policy. */
  retry?: RetryOptions;
  /** Circuit breaker policy. Reused across invocations to preserve state. */
  circuitBreaker?: CircuitBreakerOptions;
  /** Bulkhead (concurrency limiter) policy. Reused across invocations. */
  bulkhead?: BulkheadOptions;
  /** Timeout policy. */
  timeout?: TimeoutOptions;
  /** Fallback policy. */
  fallback?: FallbackOptions;
  /**
   * Predicate selecting which thrown errors are treated as *handled* failures
   * (eligible for retry / fallback / tripping the breaker). Defaults to
   * handling **all** errors. Return `true` to handle the error.
   */
  handle?: (error: unknown) => boolean;
  /**
   * Override the composition order of the configured layers. Only the listed,
   * configured layers are wrapped; unlisted layers are skipped. The first entry
   * is the outermost wrapper, the last is closest to the handler.
   *
   * @default ['fallback', 'retry', 'circuitBreaker', 'bulkhead', 'timeout']
   */
  order?: ResilienceLayer[];
  /** Optional telemetry hooks. */
  telemetry?: ResilienceTelemetry;
  /**
   * Escape hatch: provide a fully pre-built cockatiel `IPolicy`. When set, all
   * declarative options above are ignored and this policy is used verbatim.
   */
  policy?: IPolicy;
}
