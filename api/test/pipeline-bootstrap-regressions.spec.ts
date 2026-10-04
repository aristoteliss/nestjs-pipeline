/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { PipelineModule } from '@cqrs-ddd/nestjs';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  UsePipeline,
} from '@cqrs-ddd/pipeline';
import { Injectable, Scope } from '@nestjs/common';
import {
  CommandBus,
  CommandHandler,
  CqrsModule,
  EventBus,
  EventsHandler,
} from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
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

@CommandHandler(ParentCommand)
@UsePipeline([LabelBehavior, { label: 'parent' }])
class ParentHandler {
  async execute(_request: object) {
    return 'done';
  }
}

@CommandHandler(ChildCommand)
@UsePipeline([LabelBehavior, { label: 'child' }])
class ChildHandler extends ParentHandler {}

@CommandHandler(OverrideCommand)
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
    imports: [CqrsModule.forRoot(), PipelineModule.forRoot()],
    providers: [LabelBehavior, ...(providers ?? [])],
  }).compile();
  return module.createNestApplication({ logger: false });
}

describe('pipeline bootstrap lifecycle in Nest', () => {
  it('restores already wrapped handler instances when initialization fails', async () => {
    const app = await application([ParentHandler, BrokenHandler]);
    try {
      await expect(app.init()).rejects.toThrow(/MissingBehavior/);
      expect(Object.hasOwn(app.get(ParentHandler), 'execute')).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('restores the handler instances when the application closes', async () => {
    const app = await application([ParentHandler]);
    await app.init();
    const handler = app.get(ParentHandler);
    expect(Object.hasOwn(handler, 'execute')).toBe(true);

    await app.close();

    expect(Object.hasOwn(handler, 'execute')).toBe(false);
  });

  it.each([false, true])(
    'uses each inherited handler chain regardless of discovery order (child first: %s)',
    async (childFirst) => {
      const original = ParentHandler.prototype.execute;
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
        expect(ParentHandler.prototype.execute).toBe(original);
        expect(Object.hasOwn(ChildHandler.prototype, 'execute')).toBe(false);
      } finally {
        await app.close();
      }
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

  it('restores the handler instances after aggregated strict diagnostics', async () => {
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
    @CommandHandler(InvalidCommand)
    @UsePipeline(InvalidBehavior)
    class InvalidHandler {
      async execute() {
        return 'done';
      }
    }
    const app = await application([
      ParentHandler,
      InvalidHandler,
      InvalidBehavior,
    ]);
    try {
      await expect(app.init()).rejects.toThrow(
        /Pipeline configuration invalid/,
      );
      expect(Object.hasOwn(app.get(ParentHandler), 'execute')).toBe(false);
      expect(Object.hasOwn(app.get(InvalidHandler), 'execute')).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('keeps separate execute and handle runners on one handler instance', async () => {
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
    @CommandHandler(DualCommand)
    @EventsHandler(DualEvent)
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
      await expect(
        app.get(CommandBus).execute(new DualCommand()),
      ).resolves.toBe('done');
      app.get(EventBus).publish(new DualEvent());
      await vi.waitFor(() =>
        expect(observed).toEqual(['command', 'execute', 'event', 'handle']),
      );
    } finally {
      await app.close();
    }
  });
});

describe('pipeline request scope', () => {
  it('refuses a request-scoped handler that runs behaviors', async () => {
    class ScopedCommand {}
    @CommandHandler(ScopedCommand, { scope: Scope.REQUEST })
    @UsePipeline([LabelBehavior, { label: 'scoped' }])
    class ScopedHandler {
      async execute() {
        return 'done';
      }
    }
    const app = await application([ScopedHandler]);
    try {
      await expect(app.init()).rejects.toThrow(
        /ScopedHandler runs pipeline behaviors but is request-scoped/,
      );
    } finally {
      await app.close();
    }
  });

  it('refuses a handler that a request-scoped dependency makes request-scoped', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class RequestState {}
    class BubblingCommand {}
    @CommandHandler(BubblingCommand)
    @UsePipeline([LabelBehavior, { label: 'bubbling' }])
    class BubblingHandler {
      constructor(readonly state: RequestState) {}
      async execute() {
        return 'done';
      }
    }
    const app = await application([RequestState, BubblingHandler]);
    try {
      await expect(app.init()).rejects.toThrow(
        /BubblingHandler runs pipeline behaviors but is request-scoped/,
      );
    } finally {
      await app.close();
    }
  });

  it('dispatches a request-scoped handler without behaviors as Nest does', async () => {
    class PlainCommand {}
    @CommandHandler(PlainCommand, { scope: Scope.REQUEST })
    class PlainHandler {
      async execute() {
        return 'plain';
      }
    }
    const app = await application([PlainHandler]);
    try {
      await app.init();
      await expect(
        app.get(CommandBus).execute(new PlainCommand()),
      ).resolves.toBe('plain');
    } finally {
      await app.close();
    }
  });

  it('refuses a behavior that is request-scoped through a dependency', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class RequestDependency {}
    @Injectable()
    class BubblingBehavior implements IPipelineBehavior {
      constructor(readonly dependency: RequestDependency) {}
      async handle(_context: IPipelineContext, next: NextDelegate) {
        return next();
      }
    }
    class GuardedCommand {}
    @CommandHandler(GuardedCommand)
    @UsePipeline(BubblingBehavior)
    class GuardedHandler {
      async execute() {
        return 'done';
      }
    }
    const app = await application([
      GuardedHandler,
      BubblingBehavior,
      RequestDependency,
    ]);
    try {
      await expect(app.init()).rejects.toThrow(
        /BubblingBehavior must be a singleton provider/,
      );
    } finally {
      await app.close();
    }
  });
});
