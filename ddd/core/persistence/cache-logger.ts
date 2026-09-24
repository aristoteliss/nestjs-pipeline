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
 *   setKey: (user) => filterCacheKey(User.aggregateName, { id: user.id }),
 *   logger: new Logger('UserCache'), // NestJS
 * })
 * ```
 */
export interface ICacheLogger {
  warn(message: string): unknown;
}
