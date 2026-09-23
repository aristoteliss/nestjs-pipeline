/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Runs an instrumentation or diagnostic step and discards any failure.
 *
 * Observability must never change the observed outcome. The OpenTelemetry error
 * handling specification expects conforming implementations not to throw during
 * normal operation, but spans and loggers are supplied by the application and
 * the extension points around them are user-supplied.
 *
 * Diagnostics emitted from catch blocks go through this too: those blocks exist
 * to stop instrumentation from replacing the business result, and a throwing
 * logger — the logger is injected by the application — would defeat exactly
 * that.
 */
export function safely(operation: () => unknown): void {
  try {
    operation();
  } catch {
    // Intentionally ignored: see above.
  }
}
