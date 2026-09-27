/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ITenantContext } from '@common/context/tenant-context.port';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_HEADERS } from '../../common/constants/auth-headers.constants';

const tenantContext: ITenantContext = { schema: 'tenant' };

async function load(clients?: unknown[]) {
  vi.stubEnv(
    'API_CLIENTS',
    clients === undefined ? undefined : JSON.stringify(clients),
  );
  vi.resetModules();
  const { ApiClientAuthenticator } = await import('./api-client-authenticator');
  return new ApiClientAuthenticator(tenantContext);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ApiClientAuthenticator', () => {
  it('authenticates valid credentials for matching tenant', async () => {
    const authenticator = await load([
      {
        id: 'svc-1',
        key: 'secret-key-12345',
        tenant: tenantContext.schema,
        rules: ['User|read|*|id,username', '!User|read|*|email'],
      },
    ]);

    const user = authenticator.authenticate({
      headers: {
        [AUTH_HEADERS.API_ID]: 'svc-1',
        [AUTH_HEADERS.API_KEY]: 'secret-key-12345',
      },
    });

    expect(user).toEqual({
      id: 'svc-1',
      type: 'service',
      tenant: tenantContext.schema,
      grants: [
        { subject: 'User', action: 'read', fields: ['id', 'username'] },
        { subject: 'User', action: 'read', fields: ['email'], inverted: true },
      ],
    });
  });

  it('authenticates a client without rules and attaches no grants', async () => {
    const authenticator = await load([
      { id: 'svc-1', key: 'secret-key-12345', tenant: tenantContext.schema },
    ]);

    const user = authenticator.authenticate({
      headers: {
        [AUTH_HEADERS.API_ID]: 'svc-1',
        [AUTH_HEADERS.API_KEY]: 'secret-key-12345',
      },
    });

    expect(user?.grants).toBeUndefined();
  });

  it.each([
    ['a malformed rule string', ['User']],
    ['malformed conditions', ['User|read|{not json}']],
    ['a non-string rule', [{ subject: 'User', action: 'read' }]],
    ['rules that are not an array', 'User|read|*'],
  ])('fails at startup for %s', async (_, rules) => {
    await expect(
      load([
        {
          id: 'svc-1',
          key: 'secret-key-12345',
          tenant: tenantContext.schema,
          rules,
        },
      ]),
    ).rejects.toThrow(/API_CLIENTS entry "svc-1"/);
  });

  it('rejects when x-api-key is missing', async () => {
    const authenticator = await load([
      { id: 'svc-1', key: 'secret-key-12345', tenant: tenantContext.schema },
    ]);

    expect(() =>
      authenticator.authenticate({
        headers: { [AUTH_HEADERS.API_ID]: 'svc-1' },
      }),
    ).toThrow('Invalid API credentials');
  });

  it('rejects when key length does not match', async () => {
    const authenticator = await load([
      {
        id: 'svc-1',
        key: 'long-configured-key-value',
        tenant: tenantContext.schema,
      },
    ]);

    expect(() =>
      authenticator.authenticate({
        headers: {
          [AUTH_HEADERS.API_ID]: 'svc-1',
          [AUTH_HEADERS.API_KEY]: 'short',
        },
      }),
    ).toThrow('Invalid API credentials');
  });

  it('rejects when client is not authorized for current tenant schema', async () => {
    const authenticator = await load([
      {
        id: 'svc-1',
        key: 'secret-key-12345',
        tenants: ['other-tenant-schema'],
      },
    ]);

    expect(() =>
      authenticator.authenticate({
        headers: {
          [AUTH_HEADERS.API_ID]: 'svc-1',
          [AUTH_HEADERS.API_KEY]: 'secret-key-12345',
        },
      }),
    ).toThrow('Invalid API credentials');
  });

  it('returns undefined when x-api-id is not provided', async () => {
    const authenticator = await load();

    expect(authenticator.authenticate({ headers: {} })).toBeUndefined();
  });
});
