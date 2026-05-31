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
  getBehaviorId,
  PIPELINE_BEHAVIOR_ID,
  PIPELINE_BEHAVIORS_METADATA,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
  PIPELINE_OPTIONS_REGISTRY,
  UsePipeline,
} from '../decorators/pipeline.decorator';
import {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import { IPipelineContext } from '../interfaces/pipeline.context.interface';

// ── Test behaviors ──────────────────────────────────────────

class BehaviorA implements IPipelineBehavior {
  async handle(_ctx: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

class BehaviorB implements IPipelineBehavior {
  async handle(_ctx: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

class CustomIdBehavior implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_ID] = 'custom:my-behavior';
  async handle(_ctx: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

// ── Tests ───────────────────────────────────────────────────

describe('@UsePipeline decorator', () => {
  it('stores behavior classes in metadata', () => {
    @UsePipeline(BehaviorA, BehaviorB)
    class TestHandler { }

    const behaviors = Reflect.getMetadata(
      PIPELINE_BEHAVIORS_METADATA,
      TestHandler,
    );
    expect(behaviors).toEqual([BehaviorA, BehaviorB]);
  });

  it('stores empty options map when no options are provided', () => {
    @UsePipeline(BehaviorA)
    class TestHandler { }

    const options: Map<string, Record<string, unknown>> = Reflect.getMetadata(
      PIPELINE_BEHAVIORS_OPTIONS_METADATA,
      TestHandler,
    );
    expect(options).toBeInstanceOf(Map);
    expect(options.size).toBe(0);
  });

  it('stores behavior options from tuple entries', () => {
    const opts = { requestResponseLogLevel: 'log' };

    @UsePipeline([BehaviorA, opts], BehaviorB)
    class TestHandler { }

    const behaviors = Reflect.getMetadata(
      PIPELINE_BEHAVIORS_METADATA,
      TestHandler,
    );
    expect(behaviors).toEqual([BehaviorA, BehaviorB]);

    const options: Map<string, Record<string, unknown>> = Reflect.getMetadata(
      PIPELINE_BEHAVIORS_OPTIONS_METADATA,
      TestHandler,
    );
    expect(options.get(getBehaviorId(BehaviorA))).toEqual(opts);
  });

  it('populates PIPELINE_OPTIONS_REGISTRY when options are present', () => {
    const opts = { foo: 'bar' };

    @UsePipeline([BehaviorA, opts])
    class RegistryTestHandler { }

    expect(PIPELINE_OPTIONS_REGISTRY.has(RegistryTestHandler.name)).toBe(true);
    const reg = PIPELINE_OPTIONS_REGISTRY.get(RegistryTestHandler.name)!;
    expect(reg.get(getBehaviorId(BehaviorA))).toEqual(opts);
  });

  it('does not populate PIPELINE_OPTIONS_REGISTRY when no options are present', () => {
    @UsePipeline(BehaviorA)
    class NoOptionsHandler { }

    expect(PIPELINE_OPTIONS_REGISTRY.has(NoOptionsHandler.name)).toBe(false);
  });

  it('handles multiple tuple entries', () => {
    const optsA = { level: 'debug' };
    const optsB = { title: 'audit' };

    @UsePipeline([BehaviorA, optsA], [BehaviorB, optsB])
    class MultiOptionsHandler { }

    const options: Map<string, Record<string, unknown>> = Reflect.getMetadata(
      PIPELINE_BEHAVIORS_OPTIONS_METADATA,
      MultiOptionsHandler,
    );
    expect(options.size).toBe(2);
    expect(options.get(getBehaviorId(BehaviorA))).toEqual(optsA);
    expect(options.get(getBehaviorId(BehaviorB))).toEqual(optsB);
  });

  it('handles mixed plain classes and tuples', () => {
    const optsB = { key: 'value' };

    @UsePipeline(BehaviorA, [BehaviorB, optsB])
    class MixedHandler { }

    const behaviors = Reflect.getMetadata(
      PIPELINE_BEHAVIORS_METADATA,
      MixedHandler,
    );
    expect(behaviors).toEqual([BehaviorA, BehaviorB]);

    const options: Map<string, Record<string, unknown>> = Reflect.getMetadata(
      PIPELINE_BEHAVIORS_OPTIONS_METADATA,
      MixedHandler,
    );
    expect(options.size).toBe(1);
    expect(options.has(getBehaviorId(BehaviorA))).toBe(false);
    expect(options.get(getBehaviorId(BehaviorB))).toEqual(optsB);
  });
});

describe('getBehaviorId', () => {
  it('returns class name by default', () => {
    expect(getBehaviorId(BehaviorA)).toBe('BehaviorA');
  });

  it('returns PIPELINE_BEHAVIOR_ID when defined', () => {
    expect(getBehaviorId(CustomIdBehavior)).toBe('custom:my-behavior');
  });
});
