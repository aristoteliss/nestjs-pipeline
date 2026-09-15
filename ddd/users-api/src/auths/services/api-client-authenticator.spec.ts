/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { afterEach, describe, expect, it } from 'vitest';
import { AUTH_HEADERS } from '../../common/constants/auth-headers.constants';
import { ApiClientAuthenticator } from './api-client-authenticator';

const originalApiClients = process.env.API_CLIENTS;

afterEach(() => {
  if (originalApiClients === undefined) delete process.env.API_CLIENTS;
  else process.env.API_CLIENTS = originalApiClients;
});

describe('ApiClientAuthenticator', () => {
  const tenantContext = new TenantSchemaContext();

  it('authenticates valid credentials for matching tenant', () => {
    process.env.API_CLIENTS = JSON.stringify([
      {
        id: 'svc-1',
        key: 'secret-key-12345',
        tenant: tenantContext.schema,
        capabilities: { roles: ['service-role'] },
      },
    ]);

    const authenticator = new ApiClientAuthenticator(tenantContext);
    const user = authenticator.authenticate({
      headers: {
        [AUTH_HEADERS.API_ID]: 'svc-1',
        [AUTH_HEADERS.API_KEY]: 'secret-key-12345',
      },
    });

    expect(user).toEqual({
      id: 'svc-1',
      principalType: 'service',
      tenant: tenantContext.schema,
      capabilities: { roles: ['service-role'] },
    });
  });

  it('rejects when x-api-key is missing', () => {
    process.env.API_CLIENTS = JSON.stringify([
      {
        id: 'svc-1',
        key: 'secret-key-12345',
        tenant: tenantContext.schema,
      },
    ]);

    const authenticator = new ApiClientAuthenticator(tenantContext);
    expect(() =>
      authenticator.authenticate({
        headers: { [AUTH_HEADERS.API_ID]: 'svc-1' },
      }),
    ).toThrow('Invalid API credentials');
  });

  it('rejects when key length does not match', () => {
    process.env.API_CLIENTS = JSON.stringify([
      {
        id: 'svc-1',
        key: 'long-configured-key-value',
        tenant: tenantContext.schema,
      },
    ]);

    const authenticator = new ApiClientAuthenticator(tenantContext);
    expect(() =>
      authenticator.authenticate({
        headers: {
          [AUTH_HEADERS.API_ID]: 'svc-1',
          [AUTH_HEADERS.API_KEY]: 'short',
        },
      }),
    ).toThrow('Invalid API credentials');
  });

  it('rejects when client is not authorized for current tenant schema', () => {
    process.env.API_CLIENTS = JSON.stringify([
      {
        id: 'svc-1',
        key: 'secret-key-12345',
        tenants: ['other-tenant-schema'],
      },
    ]);

    const authenticator = new ApiClientAuthenticator(tenantContext);
    expect(() =>
      authenticator.authenticate({
        headers: {
          [AUTH_HEADERS.API_ID]: 'svc-1',
          [AUTH_HEADERS.API_KEY]: 'secret-key-12345',
        },
      }),
    ).toThrow('Invalid API credentials');
  });

  it('returns undefined when x-api-id is not provided', () => {
    const authenticator = new ApiClientAuthenticator(tenantContext);
    expect(authenticator.authenticate({ headers: {} })).toBeUndefined();
  });
});
