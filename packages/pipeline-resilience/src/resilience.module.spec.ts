/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { FactoryProvider, ValueProvider } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  getResiliencePolicyToken,
  RESILIENCE_DEFAULT_OPTIONS,
  RESILIENCE_MODULE_OPTIONS,
  RESILIENCE_POLICY_OPTIONS,
} from './constants/tokens';
import type { ResilienceModuleOptions } from './interfaces/resilience-options.interface';
import { ResilienceBehavior } from './resilience.behavior';
import { ResilienceModule } from './resilience.module';
import { ResiliencePolicies } from './resilience-policies';

type AnyProvider = { provide?: unknown };

function provider<T>(providers: unknown[] | undefined, token: unknown): T {
  return providers?.find(
    (candidate) => (candidate as AnyProvider).provide === token,
  ) as T;
}

describe('ResilienceModule.forRoot', () => {
  it('registers globally with no defaults and no named policies', () => {
    const dynamicModule = ResilienceModule.forRoot();

    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.module).toBe(ResilienceModule);
    expect(dynamicModule.exports).toEqual([
      ResilienceBehavior,
      ResiliencePolicies,
      RESILIENCE_DEFAULT_OPTIONS,
    ]);
    expect(dynamicModule.providers).toContain(ResiliencePolicies);

    const moduleOptions = provider<ValueProvider>(
      dynamicModule.providers,
      RESILIENCE_MODULE_OPTIONS,
    );
    expect(moduleOptions.useValue).toEqual({});
    const defaults = provider<FactoryProvider>(
      dynamicModule.providers,
      RESILIENCE_DEFAULT_OPTIONS,
    );
    expect(defaults.useFactory({})).toBeUndefined();
    const policies = provider<FactoryProvider>(
      dynamicModule.providers,
      RESILIENCE_POLICY_OPTIONS,
    );
    expect(policies.useFactory({})).toEqual({});
  });

  it('derives the defaults and the named policies from the options', () => {
    const options: ResilienceModuleOptions = {
      defaults: { timeout: { duration: 5000 } },
      policies: { paymentsApi: { timeout: { duration: 1000 } } },
    };

    const dynamicModule = ResilienceModule.forRoot(options);

    expect(
      provider<FactoryProvider>(
        dynamicModule.providers,
        RESILIENCE_DEFAULT_OPTIONS,
      ).useFactory(options),
    ).toEqual({ timeout: { duration: 5000 } });
    expect(
      provider<FactoryProvider>(
        dynamicModule.providers,
        RESILIENCE_POLICY_OPTIONS,
      ).useFactory(options),
    ).toEqual({ paymentsApi: { timeout: { duration: 1000 } } });
  });

  it('makes each named policy injectable by its token', () => {
    const dynamicModule = ResilienceModule.forRoot({
      policies: { paymentsApi: { timeout: { duration: 1000 } } },
    });
    const token = getResiliencePolicyToken('paymentsApi');

    expect(token).toBe('ResiliencePolicy:paymentsApi');
    expect(dynamicModule.exports).toContain(token);
    const named = provider<FactoryProvider>(dynamicModule.providers, token);
    expect(named.inject).toEqual([ResiliencePolicies]);
    const get = vi.fn().mockReturnValue('policy');
    expect(named.useFactory({ get })).toBe('policy');
    expect(get).toHaveBeenCalledWith('paymentsApi');
  });
});

describe('ResilienceModule.forRootAsync', () => {
  it('builds the options from the factory and exposes the listed names', () => {
    class ConfigModule {}
    const CONFIG = Symbol('CONFIG');
    const useFactory = vi.fn();

    const dynamicModule = ResilienceModule.forRootAsync({
      imports: [ConfigModule],
      inject: [CONFIG],
      useFactory,
      policyNames: ['paymentsApi'],
    });

    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.imports).toEqual([ConfigModule]);
    const moduleOptions = provider<FactoryProvider>(
      dynamicModule.providers,
      RESILIENCE_MODULE_OPTIONS,
    );
    expect(moduleOptions.useFactory).toBe(useFactory);
    expect(moduleOptions.inject).toEqual([CONFIG]);
    expect(dynamicModule.exports).toContain(
      getResiliencePolicyToken('paymentsApi'),
    );
  });

  it('defaults to no imports, no injections and no injectable names', () => {
    const dynamicModule = ResilienceModule.forRootAsync({
      useFactory: () => ({}),
    });

    expect(dynamicModule.imports).toEqual([]);
    expect(
      provider<FactoryProvider>(
        dynamicModule.providers,
        RESILIENCE_MODULE_OPTIONS,
      ).inject,
    ).toEqual([]);
    expect(dynamicModule.exports).toHaveLength(3);
  });
});
