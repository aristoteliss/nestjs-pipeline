/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Where the application's Redis server is. */
export interface RedisConfig {
  readonly host: string;
  readonly port: number;
  /** `redis://<host>:<port>`, for clients configured by URL. */
  readonly url: string;
  /** Whether `REDIS_HOST` names a server, rather than the local default. */
  readonly isConfigured: boolean;
}

/**
 * The Redis connection settings: the one place the application reads them.
 * BullMQ queues, dead-letter delivery and the pipeline response cache all take
 * their connection from here. `REDIS_HOST` defaults to `localhost` and
 * `REDIS_PORT` to `6379`; an empty value counts as unset.
 *
 * @throws {Error} When `REDIS_PORT` is not an integer between 1 and 65535.
 *
 * @example
 * ```ts
 * // REDIS_HOST=cache.internal REDIS_PORT=6380
 * const { host, port, url } = redisConfig();
 * // host === 'cache.internal', port === 6380, url === 'redis://cache.internal:6380'
 * ```
 */
export function redisConfig(): RedisConfig {
  const configuredHost = process.env.REDIS_HOST?.trim();
  const rawPort = process.env.REDIS_PORT?.trim();
  const host = configuredHost || 'localhost';
  const port = rawPort ? Number(rawPort) : 6379;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `REDIS_PORT must be an integer between 1 and 65535, received "${rawPort}".`,
    );
  }
  return {
    host,
    port,
    url: `redis://${host}:${port}`,
    isConfigured: Boolean(configuredHost),
  };
}
