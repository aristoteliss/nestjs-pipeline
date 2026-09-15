/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import { pipelineStore } from '@nestjs-pipeline/core';

/**
 * Legacy pipeline-context symbol key for an abort signal.
 *
 * @deprecated Use {@link getResilienceAbortSignal}. A pipeline context is shared
 * by overlapping aggressive-timeout attempts, so an item on it cannot identify
 * the calling attempt reliably.
 */
export const RESILIENCE_ABORT_SIGNAL_ITEM = Symbol(
  'RESILIENCE_ABORT_SIGNAL_ITEM',
);

const resilienceAttemptStore = new AsyncLocalStorage<AbortSignal>();

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
  return (
    resilienceAttemptStore.getStore() ??
    (pipelineStore.getStore()?.items.get(RESILIENCE_ABORT_SIGNAL_ITEM) as
      | AbortSignal
      | undefined)
  );
}
