/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Receives the operational warnings of the cache decorators and adapters, such as
 * a failed cache write or a miswired repository.
 *
 * Pass one through the `logger` option to route these warnings into an
 * application's logging. `console` and a NestJS `Logger` both fit. Without it,
 * warnings go to `console.warn` with a `[CacheDecorator]`-style prefix. A logger
 * that throws never changes a repository result.
 *
 * @example
 * ```ts
 * @Cache<User, UserSnapshot>({
 *   setKey: (user) => cacheKey(User.aggregateName, { id: user.id }),
 *   logger: new Logger('UserCache'), // NestJS
 * })
 * ```
 */
export interface ICacheLogger {
  warn(message: string): unknown;
}

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
