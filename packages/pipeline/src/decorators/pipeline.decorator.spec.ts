/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import {
  type BehaviorId,
  getBehaviorId,
  PIPELINE_BEHAVIOR_ID,
  PIPELINE_BEHAVIORS_METADATA,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
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
    class TestHandler {}

    const behaviors = Reflect.getMetadata(
      PIPELINE_BEHAVIORS_METADATA,
      TestHandler,
    );
    expect(behaviors).toEqual([BehaviorA, BehaviorB]);
  });

  it('stores empty options map when no options are provided', () => {
    @UsePipeline(BehaviorA)
    class TestHandler {}

    const options: Map<
      BehaviorId,
      Record<string, unknown>
    > = Reflect.getMetadata(PIPELINE_BEHAVIORS_OPTIONS_METADATA, TestHandler);
    expect(options).toBeInstanceOf(Map);
    expect(options.size).toBe(0);
  });

  it('stores behavior options from tuple entries', () => {
    const opts = { requestResponseLogLevel: 'log' };

    @UsePipeline([BehaviorA, opts], BehaviorB)
    class TestHandler {}

    const behaviors = Reflect.getMetadata(
      PIPELINE_BEHAVIORS_METADATA,
      TestHandler,
    );
    expect(behaviors).toEqual([BehaviorA, BehaviorB]);

    const options: Map<
      BehaviorId,
      Record<string, unknown>
    > = Reflect.getMetadata(PIPELINE_BEHAVIORS_OPTIONS_METADATA, TestHandler);
    expect(options.get(getBehaviorId(BehaviorA))).toEqual(opts);
  });

  it('records options on the handler that the bootstrap actually reads', () => {
    // These two cases previously asserted a process-global diagnostic registry
    // that nothing but this spec ever read — production state kept alive purely
    // so a test could observe it. The authoritative source is, and always was,
    // the reflection metadata the bootstrap reads from the handler class.
    const opts = { foo: 'bar' };

    @UsePipeline([BehaviorA, opts])
    class RegistryTestHandler {}

    const options = Reflect.getMetadata(
      PIPELINE_BEHAVIORS_OPTIONS_METADATA,
      RegistryTestHandler,
    );
    expect(options.get(getBehaviorId(BehaviorA))).toEqual(opts);
  });

  it('records an empty option map when no options are present', () => {
    @UsePipeline(BehaviorA)
    class NoOptionsHandler {}

    const options = Reflect.getMetadata(
      PIPELINE_BEHAVIORS_OPTIONS_METADATA,
      NoOptionsHandler,
    );
    expect(options.size).toBe(0);
  });

  it('keeps per-handler options separate rather than keyed by class name', () => {
    // The removed registry was keyed by class name, so two handlers sharing a
    // name overwrote each other's entry.
    const first = (() => {
      @UsePipeline([BehaviorA, { tag: 'first' }])
      class SharedName {}
      return SharedName;
    })();
    const second = (() => {
      @UsePipeline([BehaviorA, { tag: 'second' }])
      class SharedName {}
      return SharedName;
    })();

    expect(first.name).toBe(second.name);
    expect(
      Reflect.getMetadata(PIPELINE_BEHAVIORS_OPTIONS_METADATA, first).get(
        getBehaviorId(BehaviorA),
      ),
    ).toEqual({ tag: 'first' });
    expect(
      Reflect.getMetadata(PIPELINE_BEHAVIORS_OPTIONS_METADATA, second).get(
        getBehaviorId(BehaviorA),
      ),
    ).toEqual({ tag: 'second' });
  });

  it('handles multiple tuple entries', () => {
    const optsA = { level: 'debug' };
    const optsB = { title: 'audit' };

    @UsePipeline([BehaviorA, optsA], [BehaviorB, optsB])
    class MultiOptionsHandler {}

    const options: Map<
      BehaviorId,
      Record<string, unknown>
    > = Reflect.getMetadata(
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
    class MixedHandler {}

    const behaviors = Reflect.getMetadata(
      PIPELINE_BEHAVIORS_METADATA,
      MixedHandler,
    );
    expect(behaviors).toEqual([BehaviorA, BehaviorB]);

    const options: Map<
      BehaviorId,
      Record<string, unknown>
    > = Reflect.getMetadata(PIPELINE_BEHAVIORS_OPTIONS_METADATA, MixedHandler);
    expect(options.size).toBe(1);
    expect(options.has(getBehaviorId(BehaviorA))).toBe(false);
    expect(options.get(getBehaviorId(BehaviorB))).toEqual(optsB);
  });
});

describe('getBehaviorId', () => {
  it('returns the constructor itself by default', () => {
    expect(getBehaviorId(BehaviorA)).toBe(BehaviorA);
  });

  it('distinguishes unrelated classes that happen to share a name', () => {
    // Keying on the name made two modules each exporting a `LoggingBehavior`
    // collapse into one behavior — running only one and applying the other's
    // options. If one of them is a security guard, it silently disappears.
    class Shared {}
    const first = Shared;
    const second = (() => {
      class Shared {}
      return Shared;
    })();

    expect(first.name).toBe(second.name);
    expect(getBehaviorId(first as never)).not.toBe(
      getBehaviorId(second as never),
    );
  });

  it('returns PIPELINE_BEHAVIOR_ID when defined', () => {
    expect(getBehaviorId(CustomIdBehavior)).toBe('custom:my-behavior');
  });
});
