/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';

const resilienceAttemptStore = new AsyncLocalStorage<AbortSignal>();

/** Labels describing the request currently executing under a policy. */
export interface ResilienceRequestLabels {
  readonly requestName: string;
  readonly handlerName: string;
}

const resilienceRequestStore = new AsyncLocalStorage<ResilienceRequestLabels>();

/**
 * Runs a whole policy execution with the labels of the request that triggered it.
 *
 * Policies are cached per handler so that circuit-breaker and bulkhead state is
 * shared across invocations — which is correct. What was not correct was baking
 * the *first* request's name into the policy's telemetry callbacks at build
 * time: an event handler registered for several event types then reported the
 * first type forever, pointing operators at the wrong event during a retry
 * storm.
 *
 * The scope wraps the entire `policy.execute(...)` call rather than a single
 * attempt, because Cockatiel raises `onRetry`, `onBreak` and friends from its
 * own loop, outside the per-attempt callback.
 */
export function runWithResilienceRequest<T>(
  labels: ResilienceRequestLabels,
  callback: () => T,
): T {
  return resilienceRequestStore.run(labels, callback);
}

/** Labels of the in-flight request, when one is executing under a policy. */
export function getResilienceRequestLabels():
  | ResilienceRequestLabels
  | undefined {
  return resilienceRequestStore.getStore();
}

/** Runs one policy attempt with its effective signal bound to its async work. */
export function runWithResilienceAbortSignal<T>(
  signal: AbortSignal,
  callback: () => T,
): T {
  return resilienceAttemptStore.run(signal, callback);
}

/**
 * Returns the AbortSignal supplied by the active resilience policy, when called
 * inside a pipeline invocation wrapped by {@link ResilienceBehavior}.
 *
 * This is primarily useful with cooperative timeouts: pass the signal to APIs
 * that support cancellation (fetch, database clients, SDK calls, etc.) so the
 * work can stop when Cockatiel requests cancellation.
 *
 * @example
 * ```ts
 * const signal = getResilienceAbortSignal();
 * const response = await fetch('https://api.example.com/data', { signal });
 * ```
 */
export function getResilienceAbortSignal(): AbortSignal | undefined {
  return resilienceAttemptStore.getStore();
}
