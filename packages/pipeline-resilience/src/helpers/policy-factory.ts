/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { LoggerService } from '@nestjs/common';
import {
  bulkhead,
  ConsecutiveBreaker,
  ConstantBackoff,
  CountBreaker,
  circuitBreaker,
  decorrelatedJitterGenerator,
  ExponentialBackoff,
  fallback,
  fullJitterGenerator,
  halfJitterGenerator,
  handleAll,
  handleWhen,
  type IBreaker,
  type IDefaultPolicyContext,
  type IPolicy,
  IterableBackoff,
  noJitterGenerator,
  type Policy,
  retry,
  SamplingBreaker,
  TimeoutStrategy,
  timeout,
  wrap,
} from 'cockatiel';
import type {
  BulkheadOptions,
  CircuitBreakerOptions,
  FallbackOptions,
  JitterStrategy,
  ResilienceBehaviorOptions,
  ResilienceLayer,
  ResilienceTelemetry,
  RetryBackoff,
  RetryOptions,
  TimeoutOptions,
} from '../interfaces/resilience-options.interface';
import { getResilienceRequestLabels } from './resilience-context';

/** Default outermost → innermost composition order of the resilience layers. */
const DEFAULT_ORDER: readonly ResilienceLayer[] = [
  'fallback',
  'retry',
  'circuitBreaker',
  'bulkhead',
  'timeout',
] as const;

const LOG_CONTEXT = 'ResilienceBehavior';

/** Any composed cockatiel policy (allowing a fallback's alternate return). */
export type AnyPolicy = IPolicy<IDefaultPolicyContext, unknown>;

/**
 * Contextual metadata used to enrich telemetry/log messages.
 *
 * `requestName` and `handlerName` are build-time fallbacks only. A policy is
 * built once per handler and reused, so the live values are read from the
 * request-scoped store at emit time; baking the first request's name in made a
 * multi-event handler report the wrong event forever.
 */
export interface PolicyBuildContext {
  logger?: LoggerService;
  requestName: string;
  handlerName: string;
  telemetry?: ResilienceTelemetry;
}

/** Resolves the live request labels, falling back to the build-time values. */
function labels(ctx: PolicyBuildContext): {
  requestName: string;
  handlerName: string;
} {
  return (
    getResilienceRequestLabels() ?? {
      requestName: ctx.requestName,
      handlerName: ctx.handlerName,
    }
  );
}

/** Maps a {@link JitterStrategy} to its cockatiel generator function. */
function jitterGenerator(strategy?: JitterStrategy) {
  switch (strategy) {
    case 'none':
      return noJitterGenerator;
    case 'full':
      return fullJitterGenerator;
    case 'half':
      return halfJitterGenerator;
    default:
      return decorrelatedJitterGenerator;
  }
}

/** Builds a cockatiel backoff factory from declarative {@link RetryBackoff}. */
function buildBackoff(backoff: RetryBackoff) {
  switch (backoff.type) {
    case 'constant':
      return new ConstantBackoff(backoff.delay);
    case 'iterable':
      return new IterableBackoff(backoff.delays);
    case 'exponential': {
      const options: Record<string, unknown> = {
        generator: jitterGenerator(backoff.jitter),
      };
      if (backoff.initialDelay !== undefined)
        options.initialDelay = backoff.initialDelay;
      if (backoff.maxDelay !== undefined) options.maxDelay = backoff.maxDelay;
      if (backoff.exponent !== undefined) options.exponent = backoff.exponent;
      return new ExponentialBackoff(options);
    }
  }
}

/** Builds the cockatiel breaker from a declarative {@link CircuitBreakerOptions}. */
function buildBreaker(options: CircuitBreakerOptions): IBreaker {
  const breaker = options.breaker;
  switch (breaker.type) {
    case 'consecutive':
      return new ConsecutiveBreaker(breaker.threshold);
    case 'sampling':
      return new SamplingBreaker({
        threshold: breaker.threshold,
        duration: breaker.duration,
        minimumRps: breaker.minimumRps,
      });
    case 'count':
      return new CountBreaker({
        threshold: breaker.threshold,
        size: breaker.size,
        minimumNumberOfCalls: breaker.minimumNumberOfCalls,
      });
  }
}

function buildRetry(
  options: RetryOptions,
  base: Policy,
  ctx: PolicyBuildContext,
): AnyPolicy {
  const policy = retry(base, {
    maxAttempts: options.maxAttempts,
    backoff: options.backoff ? buildBackoff(options.backoff) : undefined,
  });
  policy.onRetry((event) => {
    const { requestName, handlerName } = labels(ctx);
    ctx.logger?.debug?.(
      `[resilience] retrying ${requestName} → ${handlerName} ` +
        `(attempt ${event.attempt}, delay ${event.delay}ms)`,
      LOG_CONTEXT,
    );
    ctx.telemetry?.onRetry?.({
      attempt: event.attempt,
      delay: event.delay,
      requestName,
    });
  });
  return policy;
}

function buildCircuitBreaker(
  options: CircuitBreakerOptions,
  base: Policy,
  ctx: PolicyBuildContext,
): AnyPolicy {
  const policy = circuitBreaker(base, {
    halfOpenAfter: options.halfOpenAfter,
    breaker: buildBreaker(options),
  });
  policy.onBreak(() => {
    ctx.logger?.warn?.(
      `[resilience] circuit OPEN for ${labels(ctx).handlerName}`,
      LOG_CONTEXT,
    );
    ctx.telemetry?.onCircuitOpen?.();
  });
  policy.onReset(() => {
    ctx.logger?.log?.(
      `[resilience] circuit CLOSED for ${labels(ctx).handlerName}`,
      LOG_CONTEXT,
    );
    ctx.telemetry?.onCircuitClose?.();
  });
  policy.onHalfOpen(() => {
    ctx.logger?.debug?.(
      `[resilience] circuit HALF-OPEN for ${labels(ctx).handlerName}`,
      LOG_CONTEXT,
    );
    ctx.telemetry?.onCircuitHalfOpen?.();
  });
  return policy;
}

function buildBulkhead(
  options: BulkheadOptions,
  ctx: PolicyBuildContext,
): AnyPolicy {
  const policy = bulkhead(options.limit, options.queue ?? 0);
  policy.onReject(() => {
    ctx.logger?.warn?.(
      `[resilience] bulkhead rejected ${labels(ctx).handlerName} ` +
        `(limit ${options.limit}, queue ${options.queue ?? 0})`,
      LOG_CONTEXT,
    );
    ctx.telemetry?.onBulkheadRejected?.();
  });
  return policy;
}

function buildTimeout(
  options: TimeoutOptions,
  ctx: PolicyBuildContext,
): AnyPolicy {
  const strategy =
    options.strategy === 'cooperative'
      ? TimeoutStrategy.Cooperative
      : TimeoutStrategy.Aggressive;
  const policy = timeout(options.duration, strategy);
  policy.onTimeout(() => {
    ctx.logger?.warn?.(
      `[resilience] timeout after ${options.duration}ms for ${labels(ctx).handlerName}`,
      LOG_CONTEXT,
    );
    ctx.telemetry?.onTimeout?.();
  });
  return policy;
}

function buildFallback(options: FallbackOptions, base: Policy): AnyPolicy {
  const valueOrFactory =
    'factory' in options ? () => options.factory() : options.value;
  return fallback(base, valueOrFactory);
}

/**
 * Builds a single composed cockatiel {@link IPolicy} from declarative
 * {@link ResilienceBehaviorOptions}, or `null` when nothing is configured.
 *
 * The policy is intended to be built **once per handler** and cached so that
 * stateful layers (circuit breaker, bulkhead) retain their state across
 * invocations.
 */
export function buildResiliencePolicy(
  options: ResilienceBehaviorOptions,
  ctx: PolicyBuildContext,
): AnyPolicy | null {
  // Escape hatch: a fully pre-built policy wins over everything else.
  if (options.policy) return options.policy;

  const base: Policy = options.handle
    ? handleWhen((error) => options.handle?.(error) ?? false)
    : handleAll;

  // Thread per-handler telemetry hooks into the build context.
  const buildCtx: PolicyBuildContext = { ...ctx, telemetry: options.telemetry };

  const layers: Partial<Record<ResilienceLayer, AnyPolicy>> = {};
  if (options.retry) layers.retry = buildRetry(options.retry, base, buildCtx);
  if (options.circuitBreaker)
    layers.circuitBreaker = buildCircuitBreaker(
      options.circuitBreaker,
      base,
      buildCtx,
    );
  if (options.bulkhead)
    layers.bulkhead = buildBulkhead(options.bulkhead, buildCtx);
  if (options.timeout) layers.timeout = buildTimeout(options.timeout, buildCtx);
  if (options.fallback) layers.fallback = buildFallback(options.fallback, base);

  const order = options.order ?? DEFAULT_ORDER;
  const composed: AnyPolicy[] = [];
  for (const layer of order) {
    const policy = layers[layer];
    if (policy) composed.push(policy);
  }

  if (composed.length === 0) return null;
  if (composed.length === 1) return composed[0];
  return wrap(...composed);
}
