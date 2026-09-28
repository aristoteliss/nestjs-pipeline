/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { httpExchangeStore } from '@common/context/http-exchange.store';
import { getSessionPrincipal } from '@common/context/session-principal.store';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { firstValueFrom, from, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../../auths/services/request-principal-resolver';
import { SessionPrincipalContextInterceptor } from './session-principal-context.interceptor';

function makeContext(req: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

function makeCallHandler<T>(onHandle?: () => void, result?: T): CallHandler<T> {
  return {
    handle: vi.fn(() => {
      onHandle?.();
      return of(result as T);
    }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  expect(getSessionPrincipal()).toBeUndefined();
});

describe('SessionPrincipalContextInterceptor', () => {
  it('scopes sessionPrincipalStore during next.handle() and clears afterward', async () => {
    const user = {
      id: 'user-1',
      type: 'user' as const,
      tenant: 'tenant_a',
    };
    const req: AuthenticatedRequest = { sessionPrincipal: user };
    const context = makeContext(req);

    let observedUser: unknown;
    const next = makeCallHandler(() => {
      observedUser = getSessionPrincipal();
    }, 'success');

    const interceptor = new SessionPrincipalContextInterceptor();
    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toBe('success');
    expect(observedUser).toEqual(user);
    expect(getSessionPrincipal()).toBeUndefined();
  });

  it('scopes the request session and response in httpExchangeStore during next.handle()', async () => {
    const session = { get: vi.fn() };
    const response = { cookie: vi.fn() };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ session }),
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;

    let observed: unknown;
    await firstValueFrom(
      new SessionPrincipalContextInterceptor().intercept(
        context,
        makeCallHandler(() => {
          observed = httpExchangeStore.getStore();
        }, 'ok'),
      ),
    );

    expect(observed).toEqual({ session, response });
    expect(httpExchangeStore.getStore()).toBeUndefined();
  });

  it('guarantees real multi-tenant isolation across concurrent requests (tenant_a vs tenant_b)', async () => {
    const tenantSchemaContext = new TenantSchemaContext();
    const interceptor = new SessionPrincipalContextInterceptor();

    const userA = {
      id: 'admin-a',
      type: 'user' as const,
      tenant: 'tenant_a',
    };
    const userB = {
      id: 'viewer-b',
      type: 'user' as const,
      tenant: 'tenant_b',
    };

    const observations: Array<{
      tenant: string;
      userId: string;
      schema: string;
    }> = [];

    const nextA: CallHandler = {
      handle: () =>
        from(
          new Promise((resolve) => {
            setTimeout(() => {
              observations.push({
                tenant: 'tenant_a',
                userId: getSessionPrincipal()?.id ?? 'none',
                schema: tenantSchemaContext.schema,
              });
              resolve('result-a');
            }, 20);
          }),
        ),
    };

    const nextB: CallHandler = {
      handle: () =>
        from(
          new Promise((resolve) => {
            setTimeout(() => {
              observations.push({
                tenant: 'tenant_b',
                userId: getSessionPrincipal()?.id ?? 'none',
                schema: tenantSchemaContext.schema,
              });
              resolve('result-b');
            }, 5);
          }),
        ),
    };

    // Execute concurrently inside distinct tenant contexts
    const taskA = tenantSchemaContext.run('tenant_a', () =>
      firstValueFrom(
        interceptor.intercept(makeContext({ sessionPrincipal: userA }), nextA),
      ),
    );

    const taskB = tenantSchemaContext.run('tenant_b', () =>
      firstValueFrom(
        interceptor.intercept(makeContext({ sessionPrincipal: userB }), nextB),
      ),
    );

    const [resA, resB] = await Promise.all([taskA, taskB]);

    expect(resA).toBe('result-a');
    expect(resB).toBe('result-b');

    // B completes first (5ms), A completes second (20ms)
    expect(observations).toEqual([
      { tenant: 'tenant_b', userId: 'viewer-b', schema: 'tenant_b' },
      { tenant: 'tenant_a', userId: 'admin-a', schema: 'tenant_a' },
    ]);
    expect(getSessionPrincipal()).toBeUndefined();
  });

  it('restores context to undefined even when next.handle() throws', async () => {
    const req: AuthenticatedRequest = {
      sessionPrincipal: { id: 'err-user', type: 'user', tenant: 't1' },
    };
    const context = makeContext(req);

    const next: CallHandler = {
      handle: () => throwError(() => new Error('Pipeline error')),
    };

    const interceptor = new SessionPrincipalContextInterceptor();
    await expect(
      firstValueFrom(interceptor.intercept(context, next)),
    ).rejects.toThrow('Pipeline error');

    expect(getSessionPrincipal()).toBeUndefined();
  });
});
