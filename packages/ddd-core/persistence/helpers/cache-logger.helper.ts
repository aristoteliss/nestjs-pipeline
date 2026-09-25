/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ICacheLogger } from '../cache-logger';

/** The default {@link ICacheLogger}: `console.warn` with a `[context]` prefix. */
export function consoleCacheLogger(context: string): ICacheLogger {
  return { warn: (message) => console.warn(`[${context}] ${message}`) };
}

/**
 * Writes a warning without letting the logger change the caller's outcome:
 * cache maintenance runs after a durable write, and a throwing logger must not
 * turn that success into an error.
 */
export function safeWarn(logger: ICacheLogger, message: string): void {
  try {
    logger.warn(message);
  } catch {
    // The logger itself failed; the warning is dropped, the result is not.
  }
}
