/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { redisConfig } from './redis.config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('redisConfig', () => {
  it('points at the local default when nothing is set', () => {
    vi.stubEnv('REDIS_HOST', undefined);
    vi.stubEnv('REDIS_PORT', '');

    expect(redisConfig()).toEqual({
      host: 'localhost',
      port: 6379,
      url: 'redis://localhost:6379',
      isConfigured: false,
    });
  });

  it('reads a configured server', () => {
    vi.stubEnv('REDIS_HOST', ' cache.internal ');
    vi.stubEnv('REDIS_PORT', '6380');

    expect(redisConfig()).toEqual({
      host: 'cache.internal',
      port: 6380,
      url: 'redis://cache.internal:6380',
      isConfigured: true,
    });
  });

  it.each(['0', '65536', '63.5', 'redis'])('refuses the port %s', (port) => {
    vi.stubEnv('REDIS_PORT', port);

    expect(() => redisConfig()).toThrow(
      `REDIS_PORT must be an integer between 1 and 65535, received "${port}".`,
    );
  });
});
