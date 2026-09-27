/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Raised when a job would run, or be enqueued, without part of its execution
 * context. A job never falls back to a default tenant or an anonymous principal.
 *
 * @example
 * ```ts
 * throw new MissingJobContextError('principal');
 * ```
 */
export class MissingJobContextError extends Error {
  constructor(readonly missing: string) {
    super(
      `Missing job context: ${missing}. A job never runs without it and never falls back to a default.`,
    );
    this.name = MissingJobContextError.name;
  }
}
