/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { RESILIENCE_DEFAULT_OPTIONS } from './constants/tokens';
import type { ResilienceBehaviorOptions } from './interfaces/resilience-options.interface';
import { ResilienceBehavior } from './resilience.behavior';
import { ResilienceModule } from './resilience.module';

describe('ResilienceModule.forRoot', () => {
  it('registers globally with default undefined options', () => {
    const dynamicModule = ResilienceModule.forRoot();

    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.module).toBe(ResilienceModule);
    expect(dynamicModule.exports).toEqual([
      ResilienceBehavior,
      RESILIENCE_DEFAULT_OPTIONS,
    ]);

    const optionsProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === RESILIENCE_DEFAULT_OPTIONS,
    ) as any;
    expect(optionsProvider?.useValue).toBeUndefined();
  });

  it('registers globally with custom default options', () => {
    const defaults: ResilienceBehaviorOptions = {
      timeout: { duration: 5000 },
      retry: { maxAttempts: 3 },
    };

    const dynamicModule = ResilienceModule.forRoot(defaults);

    expect(dynamicModule.global).toBe(true);
    const optionsProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === RESILIENCE_DEFAULT_OPTIONS,
    ) as any;
    expect(optionsProvider?.useValue).toEqual(defaults);
  });
});
