/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type {
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
} from '@nestjs/common';
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

/**
 * The layers {@link ResilienceBehavior} applies around a whole handler.
 * Circuit breaker and fallback belong to a dependency, so they exist only on
 * named policies ({@link ResiliencePolicyOptions}).
 */
export type HandlerResilienceLayer = Exclude<
  ResilienceLayer,
  'circuitBreaker' | 'fallback'
>;

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

/** Retry configuration of a named policy: re-runs the call on a handled failure. */
export interface RetryPolicyOptions {
  /**
   * Maximum number of retry attempts after the initial call (e.g. `3` allows
   * the original execution plus up to three retries), matching Cockatiel's
   * `retry(..., { maxAttempts })` semantics.
   */
  maxAttempts: number;

  /** Delay strategy between attempts. Defaults to no delay. */
  backoff?: RetryBackoff;
}

/** Retry configuration of the behavior — re-runs all downstream pipeline work on a handled failure. */
export interface RetryOptions extends RetryPolicyOptions {
  /**
   * Explicit acknowledgement that replaying the handler/downstream behaviors is
   * safe. Required for `command` and `event` retries because those request kinds
   * commonly perform side effects.
   *
   * Queries do not require this acknowledgement.
   *
   * Set this only when the operation is genuinely replay-safe — for example the
   * side effect is protected by a downstream idempotency key, transaction, or
   * otherwise repeatable contract. `@nestjs-pipeline/idempotency` does not make
   * arbitrary external effects exactly-once by itself.
   *
   * @example Replay-safe command retry
   * ```ts
   * @UsePipeline([ResilienceBehavior, {
   *   retry: {
   *     maxAttempts: 2,
   *     replaySafe: true,
   *     backoff: { type: 'exponential', maxDelay: 1_000 },
   *   },
   *   handle: (error) => error instanceof TransientGatewayError,
   * }])
   * ```
   */
  replaySafe?: boolean;
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

/** Timeout configuration of a named policy. Underlying work stops only when it cooperates with the abort signal. */
export interface TimeoutPolicyOptions {
  /** Duration in milliseconds after which the call times out. */
  duration: number;
  /**
   * - `aggressive` (default): reject immediately with `TaskCancelledError`.
   * - `cooperative`: signal cancellation and wait for the call to settle.
   */
  strategy?: 'aggressive' | 'cooperative';
}

/** Timeout configuration of the behavior. Underlying work stops only when it cooperates with the abort signal. */
export interface TimeoutOptions extends TimeoutPolicyOptions {
  /**
   * Explicit acknowledgement that an `aggressive` timeout is safe on a `command`
   * or `event` handler. The caller is answered while the handler keeps running,
   * so a retry, a released idempotency claim or a client retry can run the same
   * side effect alongside it. Required for those request kinds unless the
   * strategy is `cooperative`.
   */
  replaySafe?: boolean;
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

/** What every telemetry hook receives. */
export interface ResilienceTelemetryEvent {
  /** The named policy that fired the event; absent for a handler's policy. */
  policyName?: string;
}

/**
 * Optional telemetry hooks fired by the underlying cockatiel policies.
 *
 * These are attached once per policy: per handler for the behavior, per name
 * for a named policy. They are scoped to that policy rather than to a single
 * request.
 */
export interface ResilienceTelemetry {
  /** Fired before each retry, with the upcoming attempt number and delay (ms). */
  onRetry?(
    event: ResilienceTelemetryEvent & {
      attempt: number;
      delay: number;
      /**
       * The request that triggered this retry.
       *
       * A policy is cached per handler, so a handler registered for several event
       * types shares one policy; without this the consumer could not tell which
       * event is actually retrying.
       */
      requestName?: string;
    },
  ): void;
  /** Fired when the circuit breaker opens (trips). */
  onCircuitOpen?(event: ResilienceTelemetryEvent): void;
  /** Fired when the circuit breaker closes (recovers). */
  onCircuitClose?(event: ResilienceTelemetryEvent): void;
  /** Fired when the circuit breaker enters the half-open trial state. */
  onCircuitHalfOpen?(event: ResilienceTelemetryEvent): void;
  /** Fired when a timeout is reached. */
  onTimeout?(event: ResilienceTelemetryEvent): void;
  /** Fired when the bulkhead rejects a call (capacity + queue exhausted). */
  onBulkheadRejected?(event: ResilienceTelemetryEvent): void;
}

/**
 * A named policy for an outbound dependency, declared once in
 * `ResilienceModule.forRoot({ policies })` and shared by every caller through
 * `ResiliencePolicies` or `@InjectResiliencePolicy(name)`.
 *
 * It wraps one outbound call, not a handler, so it offers every layer —
 * a circuit breaker per dependency, a fallback value for one call — and needs
 * no `replaySafe` acknowledgment: the adapter retries only its own call.
 * Retry, circuit breaker and fallback still require `handle(error)` or
 * `handleAllErrors: true`.
 *
 * @example A payment API shared by several handlers
 * ```ts
 * ResilienceModule.forRoot({
 *   policies: {
 *     paymentsApi: {
 *       handle: (error) => error instanceof PaymentGatewayUnavailableError,
 *       retry: { maxAttempts: 2, backoff: { type: 'exponential' } },
 *       circuitBreaker: { halfOpenAfter: 30_000, breaker: { type: 'consecutive', threshold: 5 } },
 *       timeout: { duration: 3_000, strategy: 'cooperative' },
 *     },
 *   },
 * });
 * ```
 */
export interface ResiliencePolicyOptions {
  /** Retry the call. */
  retry?: RetryPolicyOptions;
  /** Circuit breaker, shared by every caller of the policy. */
  circuitBreaker?: CircuitBreakerOptions;
  /** Concurrency limit, shared by every caller of the policy. */
  bulkhead?: BulkheadOptions;
  /** Timeout of one call. */
  timeout?: TimeoutPolicyOptions;
  /** Value returned in place of a handled failure. */
  fallback?: FallbackOptions;
  /** Selects the errors retry, circuit breaker and fallback act on. */
  handle?: (error: unknown) => boolean;
  /** Acts on every error; set it only deliberately. */
  handleAllErrors?: boolean;
  /**
   * Composition order, outermost first.
   *
   * @default ['fallback', 'retry', 'circuitBreaker', 'bulkhead', 'timeout']
   */
  order?: ResilienceLayer[];
  /** Telemetry hooks; every event carries the policy name. */
  telemetry?: ResilienceTelemetry;
}

/**
 * Per-handler (or global default) resilience configuration.
 *
 * Compose any subset of the layers below; only the ones you set are applied.
 * Supply via `@UsePipeline([ResilienceBehavior, { ... }])` for a handler, or via
 * `ResilienceModule.forRoot({ ... })` as application-wide defaults.
 *
 * ### Safety model
 *
 * Handler-level resilience wraps `next()`. A retry therefore replays everything
 * downstream of this behavior, including the handler itself. Because that can
 * repeat side effects, the package makes the dangerous choices explicit:
 *
 * - timeout / bulkhead may be configured without an error classifier;
 * - retry requires `handle(error)` unless `handleAllErrors: true` is
 *   explicitly selected;
 * - retries for commands/events additionally require `retry.replaySafe: true`.
 *
 * A circuit breaker and a fallback belong to an outbound dependency, not to a
 * handler: declare them on a named policy (`ResilienceModule.forRoot({ policies })`)
 * and use it in the adapter, so only the remote call is repeated or short-circuited.
 * The bootstrap contract rejects them here.
 *
 * @example Query retry with an explicit transient-error classifier
 * ```ts
 * @QueryHandler(GetCatalogQuery)
 * @UsePipeline([ResilienceBehavior, {
 *   retry: { maxAttempts: 3, backoff: { type: 'exponential' } },
 *   timeout: { duration: 2_000 },
 *   handle: (error) => error instanceof CatalogUnavailableError,
 * }])
 * export class GetCatalogHandler implements IQueryHandler<GetCatalogQuery> {}
 * ```
 *
 * @example Command timeout without retry
 * ```ts
 * @CommandHandler(RebuildProjectionCommand)
 * @UsePipeline([ResilienceBehavior, {
 *   timeout: { duration: 30_000, strategy: 'cooperative' },
 * }])
 * export class RebuildProjectionHandler {}
 * ```
 */
export interface ResilienceBehaviorOptions {
  /** Retry policy. */
  retry?: RetryOptions;

  /** Bulkhead (concurrency limiter) policy. Reused across invocations. */
  bulkhead?: BulkheadOptions;

  /** Timeout policy. */
  timeout?: TimeoutOptions;

  /**
   * Predicate selecting which thrown errors are treated as *handled* failures
   * (eligible for retry). Return `true` only for failures that really are safe
   * for the configured policy.
   *
   * A declarative retry requires an explicit classifier.
   * Use {@link handleAllErrors} only when handling every thrown error is
   * intentionally part of the policy.
   */
  handle?: (error: unknown) => boolean;

  /**
   * Explicitly opt into Cockatiel's `handleAll` semantics when no classifier is
   * supplied. Prefer {@link handle} in production so validation, authorization,
   * domain and programmer errors are not retried.
   */
  handleAllErrors?: boolean;

  /**
   * Override the composition order of the configured layers. Only the listed,
   * configured layers are wrapped; unlisted layers are skipped. The first entry
   * is the outermost wrapper, the last is closest to the handler.
   *
   * @default ['retry', 'bulkhead', 'timeout']
   */
  order?: HandlerResilienceLayer[];

  /** Optional telemetry hooks. */
  telemetry?: ResilienceTelemetry;

  /**
   * Escape hatch: provide a fully pre-built cockatiel `IPolicy`. When set, all
   * declarative options above are ignored and this policy is used verbatim.
   * Declarative safety validation is skipped because the caller owns the policy
   * semantics directly.
   */
  policy?: IPolicy;
}

/** Options for `ResilienceModule.forRoot`. */
export interface ResilienceModuleOptions {
  /** Behavior options merged under every handler's own. */
  defaults?: ResilienceBehaviorOptions;
  /** Named policies for outbound dependencies, built once at startup. */
  policies?: Record<string, ResiliencePolicyOptions>;
}

/**
 * Options for `ResilienceModule.forRootAsync`: build {@link ResilienceModuleOptions}
 * from injected dependencies, such as configuration.
 *
 * @example
 * ```ts
 * ResilienceModule.forRootAsync({
 *   inject: [ConfigService],
 *   useFactory: (config: ConfigService) => ({
 *     policies: { paymentsApi: { timeout: { duration: config.get('PAYMENTS_TIMEOUT_MS') } } },
 *   }),
 *   policyNames: ['paymentsApi'],
 * });
 * ```
 */
export interface ResilienceModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /** Builds the module options; may be async. */
  useFactory: (
    ...args: never[]
  ) => ResilienceModuleOptions | Promise<ResilienceModuleOptions>;
  /** Providers injected into {@link useFactory}. */
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  /**
   * Names to make injectable with `@InjectResiliencePolicy(name)`. The factory
   * must declare each of them; a missing one fails at startup. Every policy is
   * available through `ResiliencePolicies` either way.
   */
  policyNames?: readonly string[];
}
