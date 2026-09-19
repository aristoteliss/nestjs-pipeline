/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  getBehaviorId,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
  UsePipeline,
} from '@nestjs-pipeline/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { IdempotencyBehavior } from '../idempotency.behavior';
import {
  type IdempotencyIntentOptions,
  idempotent,
} from './idempotency.intent';

describe('idempotent intent', () => {
  it('preserves the key factory in handler metadata', () => {
    const factory = () => 'tenant:principal:operation';
    @UsePipeline(idempotent({ keyFactory: factory }))
    class Handler {}
    const options = Reflect.getMetadata(
      PIPELINE_BEHAVIORS_OPTIONS_METADATA,
      Handler,
    );
    expect(options.get(getBehaviorId(IdempotencyBehavior))).toEqual({
      keyFactory: factory,
    });
  });

  it('leaves the module key unset when inheritance is explicit', () => {
    expect(idempotent({ inheritModuleKey: true })[1]).toEqual({});
  });

  it('requires a factory or explicit inheritance at compile time', () => {
    expectTypeOf<object>().not.toExtend<IdempotencyIntentOptions>();
    expectTypeOf<{
      keyFactory: string;
    }>().not.toExtend<IdempotencyIntentOptions>();
    expectTypeOf<{
      inheritModuleKey: false;
    }>().not.toExtend<IdempotencyIntentOptions>();
    expectTypeOf<{
      keyFactory: () => string;
      inheritModuleKey: true;
    }>().not.toExtend<IdempotencyIntentOptions>();
  });
});
