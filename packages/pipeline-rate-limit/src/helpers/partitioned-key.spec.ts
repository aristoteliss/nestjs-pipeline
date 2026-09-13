/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { createPartitionedRateLimitKeyFactory } from './partitioned-key';

function context(overrides: Partial<IPipelineContext> = {}): IPipelineContext {
  return {
    correlationId: 'corr-1',
    originalCorrelationId: 'corr-1',
    request: {},
    requestType: class CreateOrderCommand {},
    requestName: 'CreateOrderCommand',
    handlerType: class CreateOrderHandler {},
    handlerName: 'CreateOrderHandler',
    requestKind: 'command',
    tenantId: 'tenant-a',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map([['userId', 'user-7']]),
    getBehaviorOptions: () => undefined,
    ...overrides,
  } as unknown as IPipelineContext;
}

describe('createPartitionedRateLimitKeyFactory', () => {
  it('builds a tenant-aware per-caller bucket by default', () => {
    const factory = createPartitionedRateLimitKeyFactory(
      (ctx) => ctx.items.get('userId') as string | undefined,
    );

    expect(factory(context())).toBe('tenant-a:user-7:CreateOrderCommand');
  });

  it('can intentionally omit the tenant partition', () => {
    const factory = createPartitionedRateLimitKeyFactory(
      (ctx) => ctx.items.get('userId') as string | undefined,
      { includeTenant: false },
    );

    expect(factory(context())).toBe('user-7:CreateOrderCommand');
  });

  it('fails closed when a per-caller partition is missing', () => {
    const factory = createPartitionedRateLimitKeyFactory(() => undefined);

    expect(() => factory(context())).toThrow(/returned no identity/);
  });

  it('can explicitly fall back to the historical request-level bucket', () => {
    const factory = createPartitionedRateLimitKeyFactory(() => undefined, {
      onMissingPartition: 'request',
    });

    expect(factory(context())).toBe('CreateOrderCommand');
  });

  it('trims an accidentally padded partition before composing the key', () => {
    const factory = createPartitionedRateLimitKeyFactory(() => '  user-7  ');

    expect(factory(context())).toBe('tenant-a:user-7:CreateOrderCommand');
  });
});
