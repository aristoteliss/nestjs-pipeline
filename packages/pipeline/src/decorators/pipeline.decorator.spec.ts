/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type BehaviorId,
  getBehaviorId,
  PIPELINE_BEHAVIOR_ID,
  PIPELINE_BEHAVIORS_METADATA,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
  PIPELINE_SKIPPED_BEHAVIORS_METADATA,
  type PipelineBehaviorEntry,
  SkipPipeline,
  UsePipeline,
} from '../decorators/pipeline.decorator';
import {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import { IPipelineContext } from '../interfaces/pipeline.context.interface';

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
    // Keyed by name, two modules that each export a `LoggingBehavior` would
    // collapse into one behavior, running only one with the other's options. If
    // one of them were a security guard, it would silently disappear.
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

describe('@SkipPipeline decorator', () => {
  it('stores skipped behavior classes in metadata', () => {
    @SkipPipeline(BehaviorA, BehaviorB)
    class TestHandler {}

    const skipped = Reflect.getMetadata(
      PIPELINE_SKIPPED_BEHAVIORS_METADATA,
      TestHandler,
    );
    expect(skipped).toEqual([BehaviorA, BehaviorB]);
  });

  it('merges multiple @SkipPipeline decorators on the same class', () => {
    @SkipPipeline(BehaviorA)
    @SkipPipeline(BehaviorB)
    class MultiSkipHandler {}

    const skipped = Reflect.getMetadata(
      PIPELINE_SKIPPED_BEHAVIORS_METADATA,
      MultiSkipHandler,
    );
    expect(skipped).toEqual([BehaviorB, BehaviorA]);
  });
});

it('rejects primitive options while accepting typed interfaces', () => {
  interface Options {
    action: string;
  }
  expectTypeOf<[typeof BehaviorA, Options]>().toExtend<PipelineBehaviorEntry>();
  expectTypeOf<
    [typeof BehaviorA, number]
  >().not.toExtend<PipelineBehaviorEntry>();
  expectTypeOf<
    [typeof BehaviorA, string]
  >().not.toExtend<PipelineBehaviorEntry>();
  expectTypeOf<
    [typeof BehaviorA, null]
  >().not.toExtend<PipelineBehaviorEntry>();
  expectTypeOf<
    [typeof BehaviorA, undefined]
  >().not.toExtend<PipelineBehaviorEntry>();
});

describe('pipeline declaration normalization', () => {
  it('keeps first placement and last tuple options without erasing them on a bare repeat', () => {
    class Handler {}
    UsePipeline(
      [BehaviorA, { value: 1 }],
      BehaviorB,
      [BehaviorA, { value: 2 }],
      BehaviorA,
    )(Handler);
    expect(Reflect.getMetadata(PIPELINE_BEHAVIORS_METADATA, Handler)).toEqual([
      BehaviorA,
      BehaviorB,
    ]);
    expect(
      Reflect.getMetadata(PIPELINE_BEHAVIORS_OPTIONS_METADATA, Handler).get(
        BehaviorA,
      ),
    ).toEqual({ value: 2 });
  });

  it.each([
    undefined,
    null,
    {},
    [undefined, {}],
    [BehaviorA, null],
    [BehaviorA, []],
    [BehaviorA, {}, {}],
  ])('rejects malformed use entries with the handler name', (entry) => {
    class BrokenHandler {}
    expect(() => UsePipeline(entry as never)(BrokenHandler)).toThrow(
      /@UsePipeline.*BrokenHandler.*entry 0/,
    );
  });

  it('rejects undefined skip entries at decoration time', () => {
    class BrokenHandler {}
    expect(() => SkipPipeline(undefined as never)(BrokenHandler)).toThrow(
      /@SkipPipeline.*BrokenHandler/,
    );
  });

  it('deduplicates explicit stable identities', () => {
    class Alias extends CustomIdBehavior {}
    class Handler {}
    UsePipeline(CustomIdBehavior, Alias)(Handler);
    expect(Reflect.getMetadata(PIPELINE_BEHAVIORS_METADATA, Handler)).toEqual([
      CustomIdBehavior,
    ]);
  });
});
