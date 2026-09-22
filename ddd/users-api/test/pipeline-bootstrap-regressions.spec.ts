/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Injectable, Scope } from '@nestjs/common';
import {
  AsyncContext,
  CommandBus,
  CommandHandler,
  CqrsModule,
  EventBus,
  EventsHandler,
} from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  PipelineModule,
  UsePipeline,
} from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';

@Injectable()
class LabelBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate) {
    const label = context.getBehaviorOptions<{ label: string }>(
      LabelBehavior,
    )?.label;
    return [label, await next()];
  }
}

class ParentCommand {}
class ChildCommand {}
class OverrideCommand {}

@CommandHandler(ParentCommand, { scope: Scope.REQUEST })
@UsePipeline([LabelBehavior, { label: 'parent' }])
class ParentHandler {
  async execute(_request: object) {
    return 'done';
  }
}

@CommandHandler(ChildCommand, { scope: Scope.REQUEST })
@UsePipeline([LabelBehavior, { label: 'child' }])
class ChildHandler extends ParentHandler {}

@CommandHandler(OverrideCommand, { scope: Scope.REQUEST })
@UsePipeline([LabelBehavior, { label: 'override' }])
class OverrideHandler extends ParentHandler {
  async execute(request: object) {
    return super.execute(request);
  }
}

class MissingBehavior implements IPipelineBehavior {
  async handle(_context: IPipelineContext, next: NextDelegate) {
    return next();
  }
}
class BrokenCommand {}
@CommandHandler(BrokenCommand)
@UsePipeline(MissingBehavior)
class BrokenHandler {
  async execute() {
    return 'broken';
  }
}

async function application(
  providers: Parameters<typeof Test.createTestingModule>[0]['providers'],
) {
  const module = await Test.createTestingModule({
    imports: [
      CqrsModule.forRoot(),
      PipelineModule.forRoot({
        behaviors: [LabelBehavior],
        bootstrapLogLevel: 'none',
      }),
    ],
    providers,
  }).compile();
  return module.createNestApplication();
}

describe('pipeline bootstrap lifecycle in Nest', () => {
  it('restores an already patched prototype immediately when initialization fails', async () => {
    const original = ParentHandler.prototype.execute;
    const app = await application([ParentHandler, BrokenHandler]);
    try {
      await expect(app.init()).rejects.toThrow(/MissingBehavior/);
      expect(ParentHandler.prototype.execute).toBe(original);
    } finally {
      await app.close();
    }
  });

  it.each([false, true])(
    'uses each inherited handler chain regardless of discovery order (child first: %s)',
    async (childFirst) => {
      const providers = childFirst
        ? [ChildHandler, ParentHandler]
        : [ParentHandler, ChildHandler];
      const app = await application(providers);
      try {
        await app.init();
        const bus = app.get(CommandBus);
        await expect(bus.execute(new ParentCommand())).resolves.toEqual([
          'parent',
          'done',
        ]);
        await expect(bus.execute(new ChildCommand())).resolves.toEqual([
          'child',
          'done',
        ]);
      } finally {
        await app.close();
      }
      expect(Object.hasOwn(ChildHandler.prototype, 'execute')).toBe(false);
    },
  );

  it('allows a handler override to call super without reentering its pipeline', async () => {
    const app = await application([ParentHandler, OverrideHandler]);
    try {
      await app.init();
      await expect(
        app.get(CommandBus).execute(new OverrideCommand()),
      ).resolves.toEqual(['override', 'done']);
    } finally {
      await app.close();
    }
  });

  it('runs a repeated local behavior once with the last tuple options', async () => {
    class DuplicateCommand {}
    @CommandHandler(DuplicateCommand)
    @UsePipeline(
      [LabelBehavior, { label: 'first' }],
      [LabelBehavior, { label: 'last' }],
      LabelBehavior,
    )
    class DuplicateHandler {
      async execute() {
        return 'done';
      }
    }
    const app = await application([DuplicateHandler]);
    try {
      await app.init();
      await expect(
        app.get(CommandBus).execute(new DuplicateCommand()),
      ).resolves.toEqual(['last', 'done']);
    } finally {
      await app.close();
    }
  });
});

describe('pipeline scoped composition', () => {
  it('preserves order and request identity in a mixed singleton and scoped chain', async () => {
    const visits: { stage: string; instance: object }[] = [];
    @Injectable({ scope: Scope.REQUEST })
    class RequestState {}
    @Injectable()
    class OuterBehavior implements IPipelineBehavior {
      async handle(_context: IPipelineContext, next: NextDelegate) {
        visits.push({ stage: 'outer', instance: this });
        return next();
      }
    }
    @Injectable({ scope: Scope.REQUEST })
    class ScopedBehavior implements IPipelineBehavior {
      constructor(private readonly state: RequestState) {}
      async handle(_context: IPipelineContext, next: NextDelegate) {
        visits.push({ stage: 'scoped', instance: this.state });
        return next();
      }
    }
    @Injectable()
    class InnerBehavior implements IPipelineBehavior {
      async handle(_context: IPipelineContext, next: NextDelegate) {
        visits.push({ stage: 'inner', instance: this });
        return next();
      }
    }
    class MixedCommand {}
    @CommandHandler(MixedCommand, { scope: Scope.REQUEST })
    @UsePipeline(OuterBehavior, ScopedBehavior, InnerBehavior)
    class MixedHandler {
      constructor(private readonly state: RequestState) {}
      async execute() {
        visits.push({ stage: 'handler', instance: this.state });
        return 'done';
      }
    }
    const app = await application([
      RequestState,
      OuterBehavior,
      ScopedBehavior,
      InnerBehavior,
      MixedHandler,
    ]);
    try {
      await app.init();
      const bus = app.get(CommandBus);
      await expect(bus.execute(new MixedCommand())).resolves.toBe('done');
      await expect(bus.execute(new MixedCommand())).resolves.toBe('done');
      expect(visits.map((visit) => visit.stage)).toEqual([
        'outer',
        'scoped',
        'inner',
        'handler',
        'outer',
        'scoped',
        'inner',
        'handler',
      ]);
      expect(visits[0].instance).toBe(visits[4].instance);
      expect(visits[2].instance).toBe(visits[6].instance);
      expect(visits[1].instance).toBe(visits[3].instance);
      expect(visits[5].instance).toBe(visits[7].instance);
      expect(visits[1].instance).not.toBe(visits[5].instance);
    } finally {
      await app.close();
    }
  });

  it('preserves the surviving application when another fails initialization', async () => {
    const live = await application([ParentHandler]);
    const failed = await application([ParentHandler, BrokenHandler]);
    try {
      await live.init();
      await expect(failed.init()).rejects.toThrow(/MissingBehavior/);
      await expect(
        live.get(CommandBus).execute(new ParentCommand()),
      ).resolves.toEqual(['parent', 'done']);
    } finally {
      await failed.close();
      await live.close();
    }
  });

  it('restores prototypes after aggregated strict diagnostics', async () => {
    class InvalidBehavior implements IPipelineBehavior {
      static readonly [PIPELINE_BEHAVIOR_CONTRACT] = {
        validate: () => [
          {
            handlerName: 'InvalidHandler',
            behaviorName: 'InvalidBehavior',
            message: 'invalid',
            fix: 'configure',
          },
        ],
      };
      async handle(_context: IPipelineContext, next: NextDelegate) {
        return next();
      }
    }
    class InvalidCommand {}
    @CommandHandler(InvalidCommand, { scope: Scope.REQUEST })
    @UsePipeline(InvalidBehavior)
    class InvalidHandler {
      async execute() {
        return 'done';
      }
    }
    const original = ParentHandler.prototype.execute;
    const invalidOriginal = InvalidHandler.prototype.execute;
    const app = await application([
      ParentHandler,
      InvalidHandler,
      InvalidBehavior,
    ]);
    try {
      await expect(app.init()).rejects.toThrow(
        /Pipeline configuration invalid/,
      );
      expect(ParentHandler.prototype.execute).toBe(original);
      expect(InvalidHandler.prototype.execute).toBe(invalidOriginal);
    } finally {
      await app.close();
    }
  });

  it('keeps separate execute and handle runners on a shared scoped handler instance', async () => {
    const observed: string[] = [];
    @Injectable()
    class KindBehavior implements IPipelineBehavior {
      async handle(context: IPipelineContext, next: NextDelegate) {
        observed.push(context.requestKind);
        return next();
      }
    }
    class DualCommand {}
    class DualEvent {}
    @CommandHandler(DualCommand, { scope: Scope.REQUEST })
    @EventsHandler(DualEvent, { scope: Scope.REQUEST })
    @UsePipeline(KindBehavior)
    class DualHandler {
      async execute() {
        observed.push('execute');
        return 'done';
      }
      async handle() {
        observed.push('handle');
      }
    }
    const app = await application([DualHandler, KindBehavior]);
    try {
      await app.init();
      const context = new AsyncContext();
      await expect(
        app.get(CommandBus).execute(new DualCommand(), context),
      ).resolves.toBe('done');
      app.get(EventBus).publish(new DualEvent(), context);
      await vi.waitFor(() =>
        expect(observed).toEqual(['command', 'execute', 'event', 'handle']),
      );
    } finally {
      await app.close();
    }
  });

  it('resolves a default-scoped behavior with a request-scoped dependency per invocation', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class RequestDependency {}
    const dependencies: RequestDependency[] = [];
    @Injectable()
    class BubblingBehavior implements IPipelineBehavior {
      constructor(private readonly dependency: RequestDependency) {}
      async handle(_context: IPipelineContext, next: NextDelegate) {
        dependencies.push(this.dependency);
        return next();
      }
    }
    class BubblingCommand {}
    @CommandHandler(BubblingCommand)
    @UsePipeline(BubblingBehavior)
    class BubblingHandler {
      async execute() {
        return 'done';
      }
    }
    const app = await application([
      BubblingHandler,
      BubblingBehavior,
      RequestDependency,
    ]);
    try {
      await app.init();
      await Promise.all(
        [1, 2, 3].map(() => app.get(CommandBus).execute(new BubblingCommand())),
      );
      expect(dependencies).toHaveLength(3);
      expect(
        dependencies.every((dep) => dep instanceof RequestDependency),
      ).toBe(true);
      expect(new Set(dependencies).size).toBe(3);
    } finally {
      await app.close();
    }
  });
});
