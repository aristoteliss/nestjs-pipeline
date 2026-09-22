/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
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
    const first = storeProvider.useFactory();
    const second = storeProvider.useFactory();
    expect(first).toBeInstanceOf(MemoryIdempotencyStore);
    expect(second).not.toBe(first);
    first.destroy();
    second.destroy();
  });

  it('destroys the default store on application shutdown and leaves a supplied one', () => {
    const lifecycleOf = (
      module: ReturnType<typeof IdempotencyModule.forRoot>,
    ) =>
      module.providers?.find(
        (p: any) =>
          typeof p === 'function' &&
          typeof p.prototype.onApplicationShutdown === 'function',
      ) as any;

    const Lifecycle = lifecycleOf(IdempotencyModule.forRoot());
    const store = new MemoryIdempotencyStore();
    const destroy = vi.spyOn(store, 'destroy');
    new Lifecycle(store).onApplicationShutdown();
    expect(destroy).toHaveBeenCalledOnce();

    const suppliedStore = new MemoryIdempotencyStore();
    try {
      expect(
        lifecycleOf(IdempotencyModule.forRoot({ store: suppliedStore })),
      ).toBeUndefined();
    } finally {
      suppliedStore.destroy();
    }
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

    const moduleWithoutDefaults = IdempotencyModule.forRootAsync({
      useFactory: factory,
    });
    const defaultsProvider = moduleWithoutDefaults.providers?.find(
      (p: any) => p.provide === IDEMPOTENCY_DEFAULT_OPTIONS,
    ) as any;
    expect(defaultsProvider?.useValue).toEqual({});
  });
});
