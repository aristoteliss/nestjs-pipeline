/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { afterEach, describe, expect, it, vi } from 'vitest';

const load = () => import('./auth-token.config');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('auth token configuration', () => {
  it('applies defaults when nothing is set', async () => {
    for (const name of [
      'ACCESS_TOKEN_TTL_SECONDS',
      'REFRESH_TOKEN_TTL_SECONDS',
      'REFRESH_REUSE_GRACE_SECONDS',
      'TRUST_PROXY',
      'PERMISSIONS_IN_ACCESS_TOKEN',
      'ACCESS_TOKEN_MAX_BYTES',
    ]) {
      vi.stubEnv(name, '');
    }

    await expect(load()).resolves.toMatchObject({
      ACCESS_TOKEN_TTL_SECONDS: 300,
      REFRESH_TOKEN_TTL_SECONDS: 1_209_600,
      REFRESH_REUSE_GRACE_SECONDS: 30,
      TRUST_PROXY: undefined,
      PERMISSIONS_IN_ACCESS_TOKEN: false,
      ACCESS_TOKEN_MAX_BYTES: 2500,
    });
  });

  it.each([
    ['ACCESS_TOKEN_TTL_SECONDS', '60', 60],
    ['ACCESS_TOKEN_TTL_SECONDS', '3600', 3600],
    ['REFRESH_TOKEN_TTL_SECONDS', '3600', 3600],
    ['REFRESH_REUSE_GRACE_SECONDS', '0', 0],
    ['REFRESH_REUSE_GRACE_SECONDS', '120', 120],
    ['ACCESS_TOKEN_MAX_BYTES', '1024', 1024],
    ['ACCESS_TOKEN_MAX_BYTES', '16384', 16_384],
  ])('accepts %s=%s', async (name, value, expected) => {
    vi.stubEnv(name, value);

    expect((await load())[name as 'ACCESS_TOKEN_TTL_SECONDS']).toBe(expected);
  });

  it.each([
    ['ACCESS_TOKEN_TTL_SECONDS', '59'],
    ['ACCESS_TOKEN_TTL_SECONDS', '3601'],
    ['ACCESS_TOKEN_TTL_SECONDS', '300s'],
    ['REFRESH_TOKEN_TTL_SECONDS', '3599'],
    ['REFRESH_REUSE_GRACE_SECONDS', '-1'],
    ['REFRESH_REUSE_GRACE_SECONDS', '121'],
    ['ACCESS_TOKEN_MAX_BYTES', '1023'],
    ['ACCESS_TOKEN_MAX_BYTES', '16385'],
    ['PERMISSIONS_IN_ACCESS_TOKEN', 'yes'],
  ])('fails at load for %s=%s', async (name, value) => {
    vi.stubEnv(name, value);

    await expect(load()).rejects.toThrow(name);
  });

  it.each([
    ['true', true],
    ['false', false],
    ['2', 2],
    ['loopback, 10.0.0.0/8', 'loopback, 10.0.0.0/8'],
  ])('passes TRUST_PROXY=%s to the adapters as %s', async (value, expected) => {
    vi.stubEnv('TRUST_PROXY', value);

    expect((await load()).TRUST_PROXY).toEqual(expected);
  });

  it('enables permissions in the access token only for "true"', async () => {
    vi.stubEnv('PERMISSIONS_IN_ACCESS_TOKEN', 'true');

    expect((await load()).PERMISSIONS_IN_ACCESS_TOKEN).toBe(true);
  });
});
