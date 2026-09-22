/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { FactoryProvider, OnApplicationShutdown } from '@nestjs/common';
import {
  InMemoryProvider,
  NOOP_PROVIDER,
  OpenFeature,
} from '@openfeature/server-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_FLAGS_CLIENT } from './constants/tokens';
import { FeatureFlagsModule } from './feature-flags.module';
import type { FeatureFlagsModuleOptions } from './interfaces/feature-flags-options.interface';

async function start(options: FeatureFlagsModuleOptions) {
  const module = FeatureFlagsModule.forRoot(options);
  const factories = (module.providers ?? []).filter(
    (p): p is FactoryProvider => typeof p === 'object' && 'useFactory' in p,
  );
  await factories.find((p) => p.provide === FEATURE_FLAGS_CLIENT)?.useFactory();
  const lifecycle = factories
    .filter((p) => p.provide !== FEATURE_FLAGS_CLIENT)
    .map((p) => p.useFactory())
    .find(
      (instance): instance is OnApplicationShutdown =>
        typeof instance?.onApplicationShutdown === 'function',
    );
  if (!lifecycle) throw new Error('shutdown lifecycle provider not found');
  return lifecycle;
}

function provider() {
  const onClose = vi.fn().mockResolvedValue(undefined);
  const registered = Object.assign(new InMemoryProvider({}), { onClose });
  return { registered, onClose };
}

describe('FeatureFlagsModule shutdown', () => {
  afterEach(async () => {
    await OpenFeature.clearProviders();
  });

  it('unregisters and closes the provider it registered', async () => {
    const { registered, onClose } = provider();
    const lifecycle = await start({ provider: registered });

    await lifecycle.onApplicationShutdown?.();

    expect(OpenFeature.getProvider()).toBe(NOOP_PROVIDER);
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('unregisters a domain-bound provider only for its domain', async () => {
    const other = provider();
    await OpenFeature.setProviderAndWait(other.registered);
    const { registered } = provider();
    const lifecycle = await start({ provider: registered, domain: 'billing' });

    await lifecycle.onApplicationShutdown?.();

    expect(OpenFeature.getProvider('billing')).toBe(NOOP_PROVIDER);
    expect(OpenFeature.getProvider()).toBe(other.registered);
    expect(other.onClose).not.toHaveBeenCalled();
  });

  it('leaves a provider that another registration replaced', async () => {
    const { registered } = provider();
    const lifecycle = await start({ provider: registered });
    const replacement = provider();
    await OpenFeature.setProviderAndWait(replacement.registered);

    await lifecycle.onApplicationShutdown?.();

    expect(OpenFeature.getProvider()).toBe(replacement.registered);
    expect(replacement.onClose).not.toHaveBeenCalled();
  });
});
