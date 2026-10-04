/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { setTenantResolver } from '@cqrs-ddd/core/application';
import { currentTenantId } from '@cqrs-ddd/pipeline-tenant';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEADERS } from '../../common/constants/headers.constants.js';

const TENANT = 'tenant';

beforeEach(() => setTenantResolver(() => TENANT));
afterEach(() => setTenantResolver(currentTenantId));

async function load(clients?: unknown[]) {
  vi.stubEnv(
    'API_CLIENTS',
    clients === undefined ? undefined : JSON.stringify(clients),
  );
  vi.resetModules();
  const { ApiClientAuthenticator } = await import(
    './api-client-authenticator.js'
  );
  return new ApiClientAuthenticator();
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
        tenant: TENANT,
        rules: ['User|read|*|id,username', '!User|read|*|email'],
      },
    ]);

    const user = authenticator.authenticate({
      headers: {
        [HEADERS.API_ID]: 'svc-1',
        [HEADERS.API_KEY]: 'secret-key-12345',
      },
    });

    expect(user).toEqual({
      id: 'svc-1',
      type: 'service',
      tenant: TENANT,
      grants: [
        { subject: 'User', action: 'read', fields: ['id', 'username'] },
        { subject: 'User', action: 'read', fields: ['email'], inverted: true },
      ],
    });
  });

  it('authenticates a client without rules and attaches no grants', async () => {
    const authenticator = await load([
      { id: 'svc-1', key: 'secret-key-12345', tenant: TENANT },
    ]);

    const user = authenticator.authenticate({
      headers: {
        [HEADERS.API_ID]: 'svc-1',
        [HEADERS.API_KEY]: 'secret-key-12345',
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
          tenant: TENANT,
          rules,
        },
      ]),
    ).rejects.toThrow(/API_CLIENTS entry "svc-1"/);
  });

  it('rejects when x-api-key is missing', async () => {
    const authenticator = await load([
      { id: 'svc-1', key: 'secret-key-12345', tenant: TENANT },
    ]);

    expect(() =>
      authenticator.authenticate({
        headers: { [HEADERS.API_ID]: 'svc-1' },
      }),
    ).toThrow('Invalid API credentials');
  });

  it('rejects when key length does not match', async () => {
    const authenticator = await load([
      {
        id: 'svc-1',
        key: 'long-configured-key-value',
        tenant: TENANT,
      },
    ]);

    expect(() =>
      authenticator.authenticate({
        headers: {
          [HEADERS.API_ID]: 'svc-1',
          [HEADERS.API_KEY]: 'short',
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
          [HEADERS.API_ID]: 'svc-1',
          [HEADERS.API_KEY]: 'secret-key-12345',
        },
      }),
    ).toThrow('Invalid API credentials');
  });

  it('returns undefined when x-api-id is not provided', async () => {
    const authenticator = await load();

    expect(authenticator.authenticate({ headers: {} })).toBeUndefined();
  });
});
