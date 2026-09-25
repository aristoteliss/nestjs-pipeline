/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Runs an instrumentation or diagnostic step and discards any failure, so that
 * observability, including an application-supplied logger, never changes the
 * observed outcome.
 */
export function safely(operation: () => unknown): void {
  try {
    operation();
  } catch {
    // A failing instrumentation or diagnostic step is discarded.
  }
}
