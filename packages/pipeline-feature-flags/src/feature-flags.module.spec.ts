/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { FactoryProvider } from '@nestjs/common';
import { OpenFeature, type Provider } from '@openfeature/server-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEATURE_FLAGS_CLIENT,
  FEATURE_FLAGS_DEFAULT_CONTEXT,
  FEATURE_FLAGS_DEFAULT_OPTIONS,
  FEATURE_FLAGS_TARGETING_KEY_FACTORY,
} from './constants/tokens';
import { FeatureFlagBehavior } from './feature-flag.behavior';
import { FeatureFlagsModule } from './feature-flags.module';

vi.mock('@openfeature/server-sdk', () => ({
  OpenFeature: {
    setProvider: vi.fn(),
    setProviderAndWait: vi.fn().mockResolvedValue(undefined),
    getClient: vi.fn(() => ({ name: 'default-client' })),
  },
}));

/** Pulls the async useFactory for the FEATURE_FLAGS_CLIENT provider. */
function clientFactory(
  module: ReturnType<typeof FeatureFlagsModule.forRoot>,
): () => Promise<unknown> {
  const provider = (module.providers ?? []).find(
    (p): p is FactoryProvider =>
      typeof p === 'object' &&
      'provide' in p &&
      p.provide === FEATURE_FLAGS_CLIENT,
  );
  if (!provider) throw new Error('client provider not found');
  return provider.useFactory as () => Promise<unknown>;
}

describe('FeatureFlagsModule.forRoot', () => {
  beforeEach(() => {
    vi.mocked(OpenFeature.setProvider).mockClear();
    vi.mocked(OpenFeature.setProviderAndWait).mockClear();
    vi.mocked(OpenFeature.getClient).mockClear();
  });

  it('builds a global module exporting the behavior and tokens', () => {
    const module = FeatureFlagsModule.forRoot();

    expect(module.global).toBe(true);
    expect(module.exports).toContain(FEATURE_FLAGS_CLIENT);
  });

  it('returns the explicit client without touching OpenFeature', async () => {
    const explicit = { name: 'explicit' };
    const module = FeatureFlagsModule.forRoot({
      client: explicit as never,
    });

    await expect(clientFactory(module)()).resolves.toBe(explicit);
    expect(OpenFeature.setProviderAndWait).not.toHaveBeenCalled();
  });

  it('awaits provider readiness by default then returns the client', async () => {
    const provider = { metadata: { name: 'fake' } } as unknown as Provider;
    const module = FeatureFlagsModule.forRoot({ provider });

    await clientFactory(module)();

    expect(OpenFeature.setProviderAndWait).toHaveBeenCalledWith(provider);
    expect(OpenFeature.setProvider).not.toHaveBeenCalled();
    expect(OpenFeature.getClient).toHaveBeenCalled();
  });

  it('binds the provider to a domain when given', async () => {
    const provider = { metadata: { name: 'fake' } } as unknown as Provider;
    const module = FeatureFlagsModule.forRoot({ provider, domain: 'billing' });

    await clientFactory(module)();

    expect(OpenFeature.setProviderAndWait).toHaveBeenCalledWith(
      'billing',
      provider,
    );
    expect(OpenFeature.getClient).toHaveBeenCalledWith('billing');
  });

  it('registers without waiting when waitForReady=false', async () => {
    const provider = { metadata: { name: 'fake' } } as unknown as Provider;
    const module = FeatureFlagsModule.forRoot({
      provider,
      waitForReady: false,
    });

    await clientFactory(module)();

    expect(OpenFeature.setProvider).toHaveBeenCalledWith(provider);
    expect(OpenFeature.setProviderAndWait).not.toHaveBeenCalled();
  });

  it('returns the ambient client without registering a provider when given neither', async () => {
    const module = FeatureFlagsModule.forRoot();

    await expect(clientFactory(module)()).resolves.toEqual({
      name: 'default-client',
    });
    expect(OpenFeature.setProvider).not.toHaveBeenCalled();
    expect(OpenFeature.setProviderAndWait).not.toHaveBeenCalled();
    expect(OpenFeature.getClient).toHaveBeenCalledWith();
  });

  it('registers a domain-bound provider without waiting when waitForReady=false', async () => {
    const provider = { metadata: { name: 'fake' } } as unknown as Provider;
    const module = FeatureFlagsModule.forRoot({
      provider,
      domain: 'billing',
      waitForReady: false,
    });

    await clientFactory(module)();

    expect(OpenFeature.setProvider).toHaveBeenCalledWith('billing', provider);
    expect(OpenFeature.setProviderAndWait).not.toHaveBeenCalled();
    expect(OpenFeature.getClient).toHaveBeenCalledWith('billing');
  });

  it('provides default options and context tokens', () => {
    const defaults = { flag: 'default-flag' };
    const context = { targetingKey: 'user-1' };
    const module = FeatureFlagsModule.forRoot({ defaults, context });

    expect(module.exports).toEqual([
      FeatureFlagBehavior,
      FEATURE_FLAGS_CLIENT,
      FEATURE_FLAGS_DEFAULT_OPTIONS,
      FEATURE_FLAGS_DEFAULT_CONTEXT,
      FEATURE_FLAGS_TARGETING_KEY_FACTORY,
    ]);
  });
});
