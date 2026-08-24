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

import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_DEFAULT_OPTIONS,
  IDEMPOTENCY_STORE,
} from './constants/tokens';
import { IdempotencyBehavior } from './idempotency.behavior';
import { IdempotencyModule } from './idempotency.module';
import { MemoryIdempotencyStore } from './stores/memory.store';

describe('IdempotencyModule', () => {
  it('registers globally with default MemoryIdempotencyStore via forRoot', () => {
    const dynamicModule = IdempotencyModule.forRoot();

    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.module).toBe(IdempotencyModule);
    expect(dynamicModule.exports).toEqual([
      IdempotencyBehavior,
      IDEMPOTENCY_STORE,
      IDEMPOTENCY_DEFAULT_OPTIONS,
    ]);

    const storeProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === IDEMPOTENCY_STORE,
    ) as any;
    expect(storeProvider?.useValue).toBeInstanceOf(MemoryIdempotencyStore);
  });

  it('registers with custom store and default options via forRoot', () => {
    const customStore = new MemoryIdempotencyStore();
    const dynamicModule = IdempotencyModule.forRoot({
      store: customStore,
      defaults: { ttl: 60000 },
    });

    const storeProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === IDEMPOTENCY_STORE,
    ) as any;
    const defaultsProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === IDEMPOTENCY_DEFAULT_OPTIONS,
    ) as any;

    expect(storeProvider?.useValue).toBe(customStore);
    expect(defaultsProvider?.useValue).toEqual({ ttl: 60000 });
  });

  it('registers via forRootAsync with factory provider', () => {
    const factory = () => new MemoryIdempotencyStore();
    const dynamicModule = IdempotencyModule.forRootAsync({
      useFactory: factory,
      defaults: { ttl: 30000 },
    });

    expect(dynamicModule.global).toBe(true);
    const storeProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === IDEMPOTENCY_STORE,
    ) as any;
    expect(storeProvider?.useFactory).toBe(factory);
  });
});
