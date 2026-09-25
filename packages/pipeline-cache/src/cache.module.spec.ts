/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type {
  ClassProvider,
  DynamicModule,
  FactoryProvider,
  OnApplicationShutdown,
  Type,
  ValueProvider,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { Keyv } from 'keyv';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CacheBehavior } from './cache.behavior';
import { CacheModule } from './cache.module';
import { CACHE_DEFAULT_OPTIONS, PIPELINE_CACHE } from './constants/tokens';
import type { CacheModuleOptions } from './interfaces/cache-options.interface';

function factoryFor(module: DynamicModule, token: symbol) {
  return module.providers?.find(
    (provider) => (provider as FactoryProvider).provide === token,
  ) as FactoryProvider;
}

function build(module: DynamicModule, options: CacheModuleOptions) {
  return {
    cache: factoryFor(module, PIPELINE_CACHE).useFactory(options) as Cache,
    defaults: factoryFor(module, CACHE_DEFAULT_OPTIONS).useFactory(options),
  };
}

function lifecycle(
  module: DynamicModule,
  cache: Cache,
  options: CacheModuleOptions,
): OnApplicationShutdown {
  const LifecycleClass = module.providers?.find(
    (provider) =>
      typeof provider === 'function' &&
      provider !== CacheBehavior &&
      'prototype' in provider &&
      'onApplicationShutdown' in provider.prototype,
  ) as Type<OnApplicationShutdown> & ClassProvider['useClass'];
  return new LifecycleClass(cache, options);
}

describe('CacheModule.forRoot', () => {
  afterEach(() => vi.restoreAllMocks());

  it('builds a global dynamic module exporting cache tokens and behavior', () => {
    const options = { ttl: 15_000 };
    const dynamicModule = CacheModule.forRoot(options);

    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.exports).toEqual([
      CacheBehavior,
      PIPELINE_CACHE,
      CACHE_DEFAULT_OPTIONS,
    ]);
    expect(build(dynamicModule, options).defaults).toEqual({ ttl: 15_000 });
  });

  it('builds nothing until the application instantiates its providers', () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => {});

    const dynamicModule = CacheModule.forRoot({ store: { type: 'memory' } });
    expect(logSpy).not.toHaveBeenCalled();

    build(dynamicModule, { store: { type: 'memory' } });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Initialized cache with [memory] store'),
    );
  });

  it('builds a separate cache for each application', () => {
    const options = { store: { type: 'memory' as const } };
    const dynamicModule = CacheModule.forRoot(options);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    expect(build(dynamicModule, options).cache).not.toBe(
      build(dynamicModule, options).cache,
    );
  });

  it.each([
    [{ cache: {} as never, stores: [{} as never] }, 'custom-cache'],
    [{ stores: [{} as never] }, 'custom-stores'],
    [{ store: [{ type: 'memory' }, { type: 'memory' }] }, 'memory, memory'],
  ] as Array<[CacheModuleOptions, string]>)(
    'logs the store label used by construction for %o',
    (options, label) => {
      const logSpy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});

      build(CacheModule.forRoot(options), options);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Initialized cache with [${label}] store`),
      );
    },
  );

  it('disconnects a cache it built on application shutdown', async () => {
    const options = { store: { type: 'memory' as const } };
    const dynamicModule = CacheModule.forRoot(options);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const { cache } = build(dynamicModule, options);
    const disconnect = vi.spyOn(cache, 'disconnect');

    await lifecycle(dynamicModule, cache, options).onApplicationShutdown?.();

    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('leaves caller-supplied stores open on application shutdown', async () => {
    const store = new Keyv();
    const options = { stores: [store] };
    const dynamicModule = CacheModule.forRoot(options);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const { cache } = build(dynamicModule, options);
    const disconnect = vi.spyOn(cache, 'disconnect');

    await lifecycle(dynamicModule, cache, options).onApplicationShutdown?.();

    expect(disconnect).not.toHaveBeenCalled();
  });
});

describe('CacheModule.forRootAsync', () => {
  it('resolves module options from the injected factory', () => {
    const useFactory = vi.fn(() => ({ ttl: 5_000 }));
    const dynamicModule = CacheModule.forRootAsync({
      inject: ['CONFIG'],
      useFactory,
    });

    const optionsProvider = dynamicModule.providers?.find(
      (provider) => (provider as FactoryProvider).useFactory === useFactory,
    ) as FactoryProvider;

    expect(dynamicModule.global).toBe(true);
    expect(optionsProvider.inject).toEqual(['CONFIG']);
    expect(factoryFor(dynamicModule, CACHE_DEFAULT_OPTIONS).inject).toEqual([
      optionsProvider.provide,
    ]);
    expect(
      (dynamicModule.providers as ValueProvider[]).some(
        (provider) => provider.useValue !== undefined,
      ),
    ).toBe(false);
  });

  it('declares no factory dependencies when none are injected', () => {
    const useFactory = vi.fn(() => ({ ttl: 5_000 }));
    const dynamicModule = CacheModule.forRootAsync({ useFactory });

    const optionsProvider = dynamicModule.providers?.find(
      (provider) => (provider as FactoryProvider).useFactory === useFactory,
    ) as FactoryProvider;

    expect(optionsProvider.inject).toEqual([]);
    expect(dynamicModule.imports).toEqual([]);
  });
});
