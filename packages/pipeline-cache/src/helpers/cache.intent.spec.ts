/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  getBehaviorId,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
  UsePipeline,
} from '@nestjs-pipeline/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { CacheBehavior } from '../cache.behavior';
import { type CacheIntentOptions, cache } from './cache.intent';

describe('cache intent', () => {
  it('preserves the key factory in handler metadata', () => {
    const factory = () => 'tenant:principal:operation';
    @UsePipeline(cache({ key: factory }))
    class Handler {}
    const options = Reflect.getMetadata(
      PIPELINE_BEHAVIORS_OPTIONS_METADATA,
      Handler,
    );
    expect(options.get(getBehaviorId(CacheBehavior))).toEqual({ key: factory });
  });

  it('leaves the module key unset when inheritance is explicit', () => {
    expect(cache({ inheritModuleKey: true })[1]).toEqual({});
  });

  it('requires a factory or explicit inheritance at compile time', () => {
    expectTypeOf<object>().not.toExtend<CacheIntentOptions>();
    expectTypeOf<{ key: string }>().not.toExtend<CacheIntentOptions>();
    expectTypeOf<{
      inheritModuleKey: false;
    }>().not.toExtend<CacheIntentOptions>();
    expectTypeOf<{
      key: () => string;
      inheritModuleKey: true;
    }>().not.toExtend<CacheIntentOptions>();
  });
});
