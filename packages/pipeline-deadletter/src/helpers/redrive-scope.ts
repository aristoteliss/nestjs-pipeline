/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';

const redriving = new AsyncLocalStorage<string>();

/**
 * Runs `fn` as the redrive of dead letter `id`. Inside it, `DeadLetterBehavior`
 * neither captures a failure again nor swallows it: the redriver records the
 * attempt on the existing record instead.
 */
export function runAsRedrive<T>(id: string, fn: () => T): T {
  return redriving.run(id, fn);
}

/** The id of the dead letter being redriven, if the current execution is a redrive. */
export function currentRedriveId(): string | undefined {
  return redriving.getStore();
}
