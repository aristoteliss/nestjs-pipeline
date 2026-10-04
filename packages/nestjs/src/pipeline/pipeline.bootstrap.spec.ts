/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  PipelineConfigurationError,
  pipelineStore,
  SkipPipeline,
  UsePipeline,
} from '@cqrs-ddd/pipeline';
import {
  Injectable,
  Logger,
  Module,
  type Provider,
  Scope,
} from '@nestjs/common';
import { type DiscoveryService, NestFactory } from '@nestjs/core';
import {
  CommandBus,
  CommandHandler,
  CqrsModule,
  EventBus,
  EventsHandler,
  QueryBus,
  QueryHandler,
} from '@nestjs/cqrs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PipelineBootstrap,
  type PipelineOptions,
} from './pipeline.bootstrap.js';
import { PipelineModule } from './pipeline.module.js';

@Injectable()
class TagBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate) {
    const tag = context.getBehaviorOptions<{ tag: string }>(TagBehavior)?.tag;
    return [tag ?? context.requestKind, await next()];
  }
}

class DoCommand {}
class GetQuery {}
class HappenedEvent {}

@CommandHandler(DoCommand)
@UsePipeline([TagBehavior, { tag: 'command' }])
class DoHandler {
  async execute() {
    return 'done';
  }
}

@QueryHandler(GetQuery)
@UsePipeline(TagBehavior)
class GetHandler {
  async execute() {
    return 'got';
  }
}

const events: unknown[] = [];

@EventsHandler(HappenedEvent)
@UsePipeline(TagBehavior)
class HappenedHandler {
  async handle() {
    events.push(pipelineStore.getStore()?.requestKind);
  }
}

class PlainCommand {}

@CommandHandler(PlainCommand)
class PlainHandler {
  async execute() {
    return 'plain';
  }
}

function start(
  providers: Provider[],
  options?: PipelineOptions,
  imports: unknown[] = [],
) {
  @Module({
    imports: [
      CqrsModule.forRoot(),
      PipelineModule.forRoot(options),
      ...(imports as []),
    ],
    providers,
  })
  class AppModule {}

  return NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
}

describe('PipelineBootstrap in a Nest application', () => {
  afterEach(() => {
    events.length = 0;
    vi.restoreAllMocks();
  });

  it('runs command, query and event handlers through their pipelines', async () => {
    const app = await start([
      TagBehavior,
      DoHandler,
      GetHandler,
      HappenedHandler,
      PlainHandler,
    ]);
    try {
      await expect(
        app.get(CommandBus).execute(new DoCommand()),
      ).resolves.toEqual(['command', 'done']);
      await expect(app.get(QueryBus).execute(new GetQuery())).resolves.toEqual([
        'query',
        'got',
      ]);
      await expect(
        app.get(CommandBus).execute(new PlainCommand()),
      ).resolves.toBe('plain');
      app.get(EventBus).publish(new HappenedEvent());
      await vi.waitFor(() => expect(events).toEqual(['event']));
      expect(Object.hasOwn(app.get(PlainHandler), 'execute')).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('places global behaviors, honors a skip, and restores the instances on close', async () => {
    class SkippingCommand {}
    @CommandHandler(SkippingCommand)
    @SkipPipeline(TagBehavior)
    class SkippingHandler {
      async execute() {
        return 'skipped';
      }
    }

    const app = await start([TagBehavior, PlainHandler, SkippingHandler], {
      globalBehaviors: { before: [TagBehavior] },
    });
    const handler = app.get(PlainHandler);
    await expect(
      app.get(CommandBus).execute(new PlainCommand()),
    ).resolves.toEqual(['command', 'plain']);
    await expect(
      app.get(CommandBus).execute(new SkippingCommand()),
    ).resolves.toBe('skipped');

    await app.close();

    expect(Object.hasOwn(handler, 'execute')).toBe(false);
  });

  it("restores a handler's own method on close", async () => {
    class OwnCommand {}
    @CommandHandler(OwnCommand)
    @UsePipeline(TagBehavior)
    class OwnHandler {
      execute = async () => 'own';
    }

    const app = await start([TagBehavior, OwnHandler]);
    const handler = app.get(OwnHandler);
    await expect(
      app.get(CommandBus).execute(new OwnCommand()),
    ).resolves.toEqual(['command', 'own']);

    await app.close();

    expect(Object.hasOwn(handler, 'execute')).toBe(true);
    await expect(handler.execute()).resolves.toBe('own');
  });

  it('fails startup when no module provides a placed behavior', async () => {
    await expect(start([DoHandler])).rejects.toThrow(
      /TagBehavior runs in the pipeline of DoHandler, but no module provides it/,
    );
  });

  it('fails startup when two modules provide one behavior, naming both', async () => {
    @Module({ providers: [TagBehavior] })
    class FirstModule {}
    @Module({ providers: [TagBehavior] })
    class SecondModule {}

    await expect(
      start([DoHandler], {}, [FirstModule, SecondModule]),
    ).rejects.toThrow(
      /TagBehavior is provided by (FirstModule and SecondModule|SecondModule and FirstModule)/,
    );
  });

  it('refuses a request-scoped handler that runs behaviors', async () => {
    class ScopedCommand {}
    @CommandHandler(ScopedCommand, { scope: Scope.REQUEST })
    @UsePipeline(TagBehavior)
    class ScopedHandler {
      async execute() {
        return 'scoped';
      }
    }

    await expect(start([TagBehavior, ScopedHandler])).rejects.toThrow(
      /ScopedHandler runs pipeline behaviors but is request-scoped/,
    );
  });

  it('refuses a request-scoped behavior', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class ScopedBehavior implements IPipelineBehavior {
      async handle(_context: IPipelineContext, next: NextDelegate) {
        return next();
      }
    }
    class GuardedCommand {}
    @CommandHandler(GuardedCommand)
    @UsePipeline(ScopedBehavior)
    class GuardedHandler {
      async execute() {
        return 'guarded';
      }
    }

    await expect(start([ScopedBehavior, GuardedHandler])).rejects.toThrow(
      /ScopedBehavior must be a singleton provider/,
    );
  });

  describe('behavior contracts', () => {
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
        return 'invalid';
      }
    }
    const providers = [InvalidBehavior, InvalidHandler, TagBehavior, DoHandler];

    it('fails startup in strict mode and restores what it wrapped', async () => {
      await expect(start(providers)).rejects.toThrow(
        PipelineConfigurationError,
      );
    });

    it('logs the violation in warn mode', async () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const app = await start(providers, { diagnostics: 'warn' });
      await app.close();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "Handler 'InvalidHandler' with behavior 'InvalidBehavior': invalid. Fix: configure",
        ),
      );
    });

    it('does not check contracts when off', async () => {
      const app = await start(providers, { diagnostics: 'off' });
      await app.close();
    });
  });
});

describe('PipelineBootstrap with unusual providers', () => {
  function bootstrap(providers: unknown[]) {
    return new PipelineBootstrap(
      { getProviders: () => providers } as unknown as DiscoveryService,
      {},
    );
  }

  it('skips providers that are no handler class', () => {
    expect(() =>
      bootstrap([
        { instance: undefined, metatype: null },
        { instance: { value: 1 }, metatype: null },
      ]).onApplicationBootstrap(),
    ).not.toThrow();
  });

  it('names an unknown module for a behavior without a host', () => {
    const handler = new DoHandler();
    const wrapper = {
      instance: handler,
      metatype: DoHandler,
      isDependencyTreeStatic: () => true,
    };
    const behavior = {
      token: TagBehavior,
      instance: new TagBehavior(),
      isDependencyTreeStatic: () => true,
    };

    expect(() =>
      bootstrap([wrapper, behavior, behavior]).onApplicationBootstrap(),
    ).toThrow(/provided by an unknown module and an unknown module/);
  });

  it('refuses a behavior provider without an instance', () => {
    const wrapper = {
      instance: new DoHandler(),
      metatype: DoHandler,
      isDependencyTreeStatic: () => true,
    };
    const behavior = {
      token: TagBehavior,
      instance: undefined,
      isDependencyTreeStatic: () => true,
    };

    expect(() =>
      bootstrap([wrapper, behavior]).onApplicationBootstrap(),
    ).toThrow(/TagBehavior must be a singleton provider/);
  });
});

describe('PipelineBootstrap with an unsupported @nestjs/cqrs', () => {
  afterEach(() => {
    vi.doUnmock('@nestjs/cqrs');
    vi.resetModules();
  });

  it('fails loading when a handler decorator records no single metadata key', async () => {
    vi.resetModules();
    vi.doMock('@nestjs/cqrs', () => {
      const decorator = () => () => undefined;
      return {
        CommandHandler: decorator,
        QueryHandler: decorator,
        EventsHandler: decorator,
      };
    });

    await expect(import('./pipeline.bootstrap.js')).rejects.toThrow(
      /the installed @nestjs\/cqrs is not supported/,
    );
  });
});
