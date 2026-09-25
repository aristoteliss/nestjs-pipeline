/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { isUuidV7 } from '@cqrs-ddd/uuidv7';
import { Logger } from '@nestjs/common';
import { ExplorerService } from '@nestjs/cqrs/dist/services/explorer.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pipelineStore } from '../constants/pipeline-context.constants';
import {
  PIPELINE_BEHAVIOR_ID,
  SkipPipeline,
  UsePipeline,
} from '../decorators/pipeline.decorator';
import {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import { IPipelineContext } from '../interfaces/pipeline.context.interface';
import { PipelineBootstrapService } from './pipeline.bootstrap.service';

class MockBehavior implements IPipelineBehavior {
  async handle(ctx: IPipelineContext, next: NextDelegate) {
    ctx.items.set('mock', true);
    return next();
  }
}

class SecondMockBehavior implements IPipelineBehavior {
  static callCount = 0;
  async handle(ctx: IPipelineContext, next: NextDelegate) {
    SecondMockBehavior.callCount++;
    ctx.items.set('second', true);
    return next();
  }
}

class ConfiguredMockBehavior implements IPipelineBehavior {
  static callCount = 0;

  async handle(ctx: IPipelineContext, next: NextDelegate) {
    ConfiguredMockBehavior.callCount++;
    ctx.items.set('configured', ctx.getBehaviorOptions(ConfiguredMockBehavior));
    return next();
  }
}

class MockCommand {
  constructor(public id: number) {}
}

class MockQuery {
  constructor(public id: number) {}
}

class MockEvent {
  constructor(public payload: string) {}
}

@UsePipeline(MockBehavior)
class MockCommandHandler {
  async execute(command: MockCommand) {
    return { ok: true, id: command.id, store: pipelineStore.getStore() };
  }
}

class NoPipelineCommandHandler {
  async execute(_command: MockCommand) {
    return { ok: true, store: pipelineStore.getStore() };
  }
}

// Exposes pipelineStore so tests can verify the pipeline ran inside it.
class ScopedCommandHandler {
  async execute(_command: MockCommand) {
    return { scoped: true, store: pipelineStore.getStore() };
  }
}

@UsePipeline(MockBehavior)
class MockQueryHandler {
  async execute(query: MockQuery) {
    return { queryResult: true, id: query.id, store: pipelineStore.getStore() };
  }
}

@UsePipeline(MockBehavior)
class MockEventHandler {
  async handle(event: MockEvent) {
    return {
      eventHandled: true,
      payload: event.payload,
      store: pipelineStore.getStore(),
    };
  }
}

// scope 0 = Scope.DEFAULT (singleton), 1 = TRANSIENT, 2 = REQUEST

function makeWrapper(
  instance: any,
  metatype: any,
  scope = 0,
  dependencyTreeStatic = scope !== 2,
) {
  return {
    instance,
    metatype,
    scope,
    isDependencyTreeStatic: vi.fn(() => dependencyTreeStatic),
  };
}

describe('PipelineBootstrapService', () => {
  let moduleRefMock: any;
  let explorerServiceMock: any;
  const bootstrapped: PipelineBootstrapService[] = [];

  function bootstrap(options?: unknown): PipelineBootstrapService {
    const service = new PipelineBootstrapService(
      moduleRefMock,
      options as never,
    );
    bootstrapped.push(service);
    service.onApplicationBootstrap();
    return service;
  }

  afterEach(() => {
    while (bootstrapped.length > 0) {
      bootstrapped.pop()?.onModuleDestroy();
    }
  });

  beforeEach(() => {
    SecondMockBehavior.callCount = 0;

    explorerServiceMock = {
      explore: vi
        .fn()
        .mockReturnValue({ commands: [], queries: [], events: [] }),
    };

    moduleRefMock = {
      get: vi.fn((token: any) => {
        if (token === ExplorerService) return explorerServiceMock;
        if (token === MockBehavior) return new MockBehavior();
        if (token === SecondMockBehavior) return new SecondMockBehavior();
        if (typeof token === 'function') {
          try {
            return new token();
          } catch {
            /**/
          }
        }
        throw new Error(`Unexpected DI token: ${token?.name ?? token}`);
      }),
      resolve: vi.fn(),
    };
  });

  describe('Core singleton wrapping', () => {
    it('reports a frozen handler restoration failure and continues cleanup', () => {
      @UsePipeline(MockBehavior)
      class Handler {
        execute = async (_request: object) => 'done';
      }
      const handler = new Handler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, Handler)],
      });
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      try {
        const service = bootstrap();
        Object.freeze(handler);
        expect(() => service.onModuleDestroy()).not.toThrow();
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(
            'Failed to unwrap pipeline handler during cleanup',
          ),
        );
      } finally {
        warn.mockRestore();
      }
    });

    it('filters skipped global after behaviors while retaining the others', async () => {
      @SkipPipeline(SecondMockBehavior)
      class Handler {
        async execute(_request: object) {
          return pipelineStore.getStore();
        }
      }
      const handler = new Handler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, Handler)],
      });
      bootstrap({
        globalBehaviors: { after: [SecondMockBehavior, MockBehavior] },
      });
      const context = await handler.execute(new MockCommand(1));
      expect(context?.items.get('mock')).toBe(true);
      expect(context?.items.has('second')).toBe(false);
    });

    it.each([undefined, 'not a method'])(
      'skips a handler with execute=%s',
      (execute) => {
        class InvalidHandler {}
        const handler = Object.assign(new InvalidHandler(), { execute });
        explorerServiceMock.explore.mockReturnValue({
          commands: [makeWrapper(handler, InvalidHandler)],
        });
        bootstrap({ globalBehaviors: { before: [MockBehavior] } });
        expect(handler.execute).toBe(execute);
      },
    );

    it('leaves an already wrapped singleton untouched on repeated bootstrap', async () => {
      @UsePipeline(MockBehavior)
      class Handler {
        async execute(_request: object) {
          return 'done';
        }
      }
      const handler = new Handler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, Handler)],
      });
      const service = bootstrap();
      const wrapped = handler.execute;
      service.onApplicationBootstrap();
      expect(handler.execute).toBe(wrapped);
      await expect(handler.execute(new MockCommand(1))).resolves.toBe('done');
    });

    it('skips an absent inherited handler method', () => {
      @UsePipeline(MockBehavior)
      class Handler {}
      const handler = new Handler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, Handler)],
      });
      bootstrap();
      expect(Object.hasOwn(handler, 'execute')).toBe(false);
    });

    it.each([undefined, null, 'lookup failed'])(
      'preserves a non-object provider lookup failure as its cause',
      (failure) => {
        @UsePipeline(MockBehavior)
        class Handler {
          async execute() {
            return 'done';
          }
        }
        explorerServiceMock.explore.mockReturnValue({
          commands: [makeWrapper(new Handler(), Handler)],
        });
        moduleRefMock.get.mockImplementation((token: unknown) => {
          if (token === ExplorerService) return explorerServiceMock;
          throw failure;
        });
        expect(() => bootstrap()).toThrow(
          expect.objectContaining({ cause: failure }),
        );
        expect(moduleRefMock.resolve).not.toHaveBeenCalled();
      },
    );

    it('rejects a falsy singleton provider rather than treating it as scoped', () => {
      @UsePipeline(MockBehavior)
      class Handler {
        async execute() {
          return 'done';
        }
      }
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(new Handler(), Handler)],
      });
      moduleRefMock.get.mockImplementation((token: unknown) =>
        token === ExplorerService ? explorerServiceMock : undefined,
      );
      expect(() => bootstrap()).toThrow(/resolved to a falsy value/);
      expect(moduleRefMock.resolve).not.toHaveBeenCalled();
    });

    it('wraps execute() and runs the full behavior chain', async () => {
      const handler = new MockCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, MockCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap();

      const result = await handler.execute(new MockCommand(7));

      expect(result.ok).toBe(true);
      expect(result.id).toBe(7);
      expect(result.store).toBeDefined();
      expect(result.store!.request).toBeInstanceOf(MockCommand);
      expect(result.store!.items.get('mock')).toBe(true);
    });

    it('does NOT wrap a handler with no @UsePipeline and no matching global behaviors', async () => {
      const handler = new NoPipelineCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NoPipelineCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap();

      const result = await handler.execute(new MockCommand(1));
      expect(result.store).toBeUndefined();
    });

    it('skips a singleton wrapper whose instance is undefined', () => {
      // scope 0 = DEFAULT = isScoped false. No instance → should skip silently.
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(undefined, MockCommandHandler, 0)],
        queries: [],
        events: [],
      });
      expect(() =>
        new PipelineBootstrapService(moduleRefMock).onApplicationBootstrap(),
      ).not.toThrow();
    });

    it('skips a wrapper where both metatype and instance are undefined', () => {
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(undefined, undefined, 0)],
        queries: [],
        events: [],
      });
      expect(() =>
        new PipelineBootstrapService(moduleRefMock).onApplicationBootstrap(),
      ).not.toThrow();
    });
  });

  describe('Query and Event handler wrapping', () => {
    it('wraps query handler.execute() and sets requestKind to "query"', async () => {
      const handler = new MockQueryHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [],
        events: [],
        queries: [makeWrapper(handler, MockQueryHandler)],
      });

      bootstrap();

      const result = await handler.execute(new MockQuery(99));

      expect(result.queryResult).toBe(true);
      expect(result.id).toBe(99);
      expect(result.store!.requestKind).toBe('query');
      expect(result.store!.items.get('mock')).toBe(true);
    });

    it('wraps event handler.handle() (not execute) and sets requestKind to "event"', async () => {
      const handler = new MockEventHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [],
        queries: [],
        events: [makeWrapper(handler, MockEventHandler)],
      });

      bootstrap();

      const result = await handler.handle(new MockEvent('hello'));

      expect(result.eventHandled).toBe(true);
      expect(result.payload).toBe('hello');
      expect(result.store!.requestKind).toBe('event');
      expect(result.store!.items.get('mock')).toBe(true);
    });
  });

  describe('Scoped handlers (REQUEST scope: 2, TRANSIENT scope: 1)', () => {
    it('binds instances read or written through Nest and restores hooks on shutdown', async () => {
      @UsePipeline(MockBehavior)
      class Handler {
        async execute(_request: object) {
          return pipelineStore.getStore()?.items.get('mock') ?? 'unwrapped';
        }
      }
      let host: { instance?: unknown } = {};
      const get = vi.fn(() => host);
      const set = vi.fn((_id: unknown, value: typeof host) => {
        host = value;
      });
      const wrapper = {
        ...makeWrapper(undefined, Handler, 2),
        getInstanceByContextId: get,
        setInstanceByContextId: set,
      };
      explorerServiceMock.explore.mockReturnValue({ commands: [wrapper] });
      const service = bootstrap();
      const dispatcher = Handler.prototype.execute;
      service.onApplicationBootstrap();
      expect(Handler.prototype.execute).toBe(dispatcher);
      expect(wrapper.getInstanceByContextId()).toBe(host);
      wrapper.setInstanceByContextId({}, { instance: 'pending' });
      expect(wrapper.getInstanceByContextId()).toEqual({ instance: 'pending' });
      const first = new Handler();
      wrapper.setInstanceByContextId({}, { instance: first });
      expect(wrapper.getInstanceByContextId().instance).toBe(first);
      await expect(first.execute(new MockCommand(1))).resolves.toBe(true);
      await expect(
        dispatcher.call(undefined, new MockCommand(1)),
      ).resolves.toBe(true);
      service.onModuleDestroy();
      expect(wrapper.getInstanceByContextId).toBe(get);
      expect(wrapper.setInstanceByContextId).toBe(set);
      await expect(dispatcher.call(first, new MockCommand(1))).resolves.toBe(
        'unwrapped',
      );
    });

    it('routes inherited super calls to the ancestor without repeating the child pipeline', async () => {
      @UsePipeline(SecondMockBehavior)
      class Parent {
        async execute(_request: object) {
          return 'done';
        }
      }
      @UsePipeline(MockBehavior)
      class Child extends Parent {
        async execute(request: object) {
          return super.execute(request);
        }
      }
      let host = { instance: new Child() };
      const childWrapper = {
        ...makeWrapper(undefined, Child, 2),
        getInstanceByContextId: () => host,
      };
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(undefined, Parent, 2), childWrapper],
      });
      bootstrap();
      const child = childWrapper.getInstanceByContextId().instance;
      await expect(child.execute(new MockCommand(1))).resolves.toBe('done');
      expect(SecondMockBehavior.callCount).toBe(0);
      host = { instance: new Child() };
    });

    it('patches the prototype for REQUEST-scoped handlers (scope: 2)', async () => {
      // At bootstrap, instance is undefined for scoped providers.
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(undefined, ScopedCommandHandler, 2)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: { before: [MockBehavior] },
      });

      // A freshly-created instance inherits the patched prototype.
      const freshInstance = new ScopedCommandHandler();
      const result = (await freshInstance.execute(new MockCommand(5))) as any;

      // Pipeline context must be active → proves prototype was patched
      expect(result.store).toBeDefined();
      expect(result.store!.requestKind).toBe('command');
      expect(result.store!.items.get('mock')).toBe(true);
    });

    it('patches the CQRS-bound instance for a static TRANSIENT handler', async () => {
      const handler = new ScopedCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, ScopedCommandHandler, 1, true)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: { before: [MockBehavior] },
      });

      const result = (await handler.execute(new MockCommand(3))) as any;

      expect(result.store).toBeDefined();
      expect(result.store!.items.get('mock')).toBe(true);
    });

    it('patches the prototype when DEFAULT scope bubbles from a request-scoped dependency', async () => {
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(undefined, ScopedCommandHandler, 0, false)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: { before: [MockBehavior] },
      });

      const contextualInstance = new ScopedCommandHandler();
      const result = (await contextualInstance.execute(
        new MockCommand(4),
      )) as any;

      expect(result.store).toBeDefined();
      expect(result.store!.items.get('mock')).toBe(true);
    });
  });

  describe('Global behaviors — handler-kind scope filtering', () => {
    it('applies global behaviors to commands when scope is "commands"', async () => {
      const handler = new NoPipelineCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NoPipelineCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: { scope: 'commands', before: [MockBehavior] },
      });

      const result = await handler.execute(new MockCommand(1));
      expect(result.store).toBeDefined();
      expect(result.store!.items.get('mock')).toBe(true);
    });

    it('does NOT apply scope:"commands" global behaviors to queries', async () => {
      class PlainQueryHandler {
        async execute(_q: MockQuery) {
          return { store: pipelineStore.getStore() };
        }
      }
      const handler = new PlainQueryHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [],
        queries: [makeWrapper(handler, PlainQueryHandler)],
        events: [],
      });

      bootstrap({
        globalBehaviors: { scope: 'commands', before: [MockBehavior] },
      });

      const result = await handler.execute(new MockQuery(1));
      expect(result.store).toBeUndefined();
    });

    it('does NOT apply scope:"queries" global behaviors to commands', async () => {
      const handler = new NoPipelineCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NoPipelineCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: { scope: 'queries', before: [MockBehavior] },
      });

      const result = await handler.execute(new MockCommand(1));
      expect(result.store).toBeUndefined();
    });

    it('does NOT apply scope:"events" global behaviors to commands', async () => {
      const handler = new NoPipelineCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NoPipelineCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: { scope: 'events', before: [MockBehavior] },
      });

      const result = await handler.execute(new MockCommand(1));
      expect(result.store).toBeUndefined();
    });

    it('applies global behaviors to all handler kinds when scope is "all" (default)', async () => {
      class PlainQueryHandler2 {
        async execute(_q: MockQuery) {
          return { store: pipelineStore.getStore() };
        }
      }
      class PlainEventHandler2 {
        async handle(_e: MockEvent) {
          return pipelineStore.getStore();
        }
      }

      const cmdHandler = new NoPipelineCommandHandler();
      const qHandler = new PlainQueryHandler2();
      const evHandler = new PlainEventHandler2();

      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(cmdHandler, NoPipelineCommandHandler)],
        queries: [makeWrapper(qHandler, PlainQueryHandler2)],
        events: [makeWrapper(evHandler, PlainEventHandler2)],
      });

      // Omitting scope exercises the 'all' default code path.
      bootstrap({
        globalBehaviors: { before: [MockBehavior] },
      });

      const cmdResult = await cmdHandler.execute(new MockCommand(1));
      const qResult = await qHandler.execute(new MockQuery(1));
      const evStore = await evHandler.handle(new MockEvent('e'));

      expect(cmdResult.store).toBeDefined();
      expect(qResult.store).toBeDefined();
      expect(evStore).toBeDefined();
    });
  });

  describe('Global behaviors — array form (multiple GlobalBehaviorsOptions)', () => {
    it('applies mixed-scope array entries to the correct handler kinds', async () => {
      class PlainQueryHandler3 {
        async execute(_q: MockQuery) {
          return { store: pipelineStore.getStore() };
        }
      }

      const cmdHandler = new NoPipelineCommandHandler();
      const qHandler = new PlainQueryHandler3();

      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(cmdHandler, NoPipelineCommandHandler)],
        queries: [makeWrapper(qHandler, PlainQueryHandler3)],
        events: [],
      });

      bootstrap({
        globalBehaviors: [
          { scope: 'commands', before: [MockBehavior] },
          { scope: 'queries', before: [SecondMockBehavior] },
        ],
      });

      const cmdResult = await cmdHandler.execute(new MockCommand(1));
      const qResult = await qHandler.execute(new MockQuery(1));

      expect(cmdResult.store).toBeDefined();
      expect(cmdResult.store!.items.get('mock')).toBe(true);
      expect(cmdResult.store!.items.get('second')).toBeUndefined();

      expect(qResult.store).toBeDefined();
      expect(qResult.store!.items.get('second')).toBe(true);
      expect(qResult.store!.items.get('mock')).toBeUndefined();
    });

    it('merges behaviors from multiple array entries with matching scopes', async () => {
      const handler = new NoPipelineCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NoPipelineCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: [
          { scope: 'all', before: [MockBehavior] },
          { scope: 'commands', before: [SecondMockBehavior] },
        ],
      });

      const result = await handler.execute(new MockCommand(1));

      expect(result.store).toBeDefined();
      expect(result.store!.items.get('mock')).toBe(true);
      expect(result.store!.items.get('second')).toBe(true);
    });

    it('composes matching scope blocks in declaration order', async () => {
      // An 'all' block declared first wraps a later 'commands' block, so a
      // behavior in 'all' is outside one in 'commands' and its errors never
      // reach it.
      const calls: string[] = [];
      class OuterBehavior implements IPipelineBehavior {
        async handle(_ctx: IPipelineContext, next: NextDelegate) {
          calls.push('outer:in');
          const result = await next();
          calls.push('outer:out');
          return result;
        }
      }
      class InnerBehavior implements IPipelineBehavior {
        async handle(_ctx: IPipelineContext, next: NextDelegate) {
          calls.push('inner:in');
          const result = await next();
          calls.push('inner:out');
          return result;
        }
      }

      const handler = new NoPipelineCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NoPipelineCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: [
          { scope: 'all', before: [OuterBehavior] },
          { scope: 'commands', before: [InnerBehavior] },
        ],
      });

      await handler.execute(new MockCommand(1));

      expect(calls).toEqual(['outer:in', 'inner:in', 'inner:out', 'outer:out']);
    });

    it('deduplicates the same behavior across matching global configs and uses the later options', async () => {
      ConfiguredMockBehavior.callCount = 0;
      const handler = new NoPipelineCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NoPipelineCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: [
          {
            scope: 'all',
            before: [[ConfiguredMockBehavior, { source: 'all' }]],
          },
          {
            scope: 'commands',
            before: [[ConfiguredMockBehavior, { source: 'commands' }]],
          },
        ],
      });

      const result = await handler.execute(new MockCommand(1));

      expect(ConfiguredMockBehavior.callCount).toBe(1);
      expect(result.store?.items.get('configured')).toEqual({
        source: 'commands',
      });
    });

    it('does not clear tuple options when a later matching config uses a bare reference', async () => {
      ConfiguredMockBehavior.callCount = 0;
      const handler = new NoPipelineCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NoPipelineCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: [
          {
            scope: 'all',
            before: [[ConfiguredMockBehavior, { source: 'all' }]],
          },
          { scope: 'commands', before: [ConfiguredMockBehavior] },
        ],
      });

      const result = await handler.execute(new MockCommand(1));

      expect(ConfiguredMockBehavior.callCount).toBe(1);
      expect(result.store?.items.get('configured')).toEqual({ source: 'all' });
    });

    it('runs a behavior declared in both global before and after once, at its before position', async () => {
      ConfiguredMockBehavior.callCount = 0;
      const handler = new NoPipelineCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NoPipelineCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: {
          scope: 'all',
          before: [[ConfiguredMockBehavior, { source: 'before' }]],
          after: [ConfiguredMockBehavior],
        },
      });

      const result = await handler.execute(new MockCommand(1));

      expect(ConfiguredMockBehavior.callCount).toBe(1);
      expect(result.store?.items.get('configured')).toEqual({
        source: 'before',
      });
    });

    it('skips array entries whose scope does not match the handler kind', async () => {
      const handler = new NoPipelineCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NoPipelineCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: [
          { scope: 'queries', before: [MockBehavior] },
          { scope: 'events', before: [SecondMockBehavior] },
        ],
      });

      const result = await handler.execute(new MockCommand(1));
      expect(result.store).toBeUndefined();
    });

    it('handles an empty array gracefully', async () => {
      const handler = new NoPipelineCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NoPipelineCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: [],
      });

      const result = await handler.execute(new MockCommand(1));
      expect(result.store).toBeUndefined();
    });
  });

  describe('Deduplication — same behavior in @UsePipeline and globalBehaviors', () => {
    it('runs the behavior only once when it appears in both @UsePipeline and global before', async () => {
      @UsePipeline(SecondMockBehavior)
      class DedupHandler {
        async execute(_cmd: MockCommand) {
          return pipelineStore.getStore();
        }
      }
      const handler = new DedupHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, DedupHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        // Same class as @UsePipeline — it must run once at its global position.
        globalBehaviors: { before: [SecondMockBehavior] },
      });

      await handler.execute(new MockCommand(1));

      // If deduplication failed, callCount would be 2.
      expect(SecondMockBehavior.callCount).toBe(1);
    });

    it('handler-level options patch global options field by field', async () => {
      const globalOpts = { level: 'info', prefix: 'G-' };
      const localOpts = { level: 'debug', suffix: '-H' };

      @UsePipeline([MockBehavior, localOpts])
      class OverrideHandler {
        async execute(_cmd: MockCommand) {
          return { store: pipelineStore.getStore() };
        }
      }
      const handler = new OverrideHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, OverrideHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: { before: [[MockBehavior, globalOpts]] },
      });

      const result = await handler.execute(new MockCommand(1));

      // `prefix` survives: narrowing one field must not require restating the
      // rest of the application-wide configuration.
      const opts = result.store!.getBehaviorOptions(MockBehavior);
      expect(opts).toEqual({ level: 'debug', prefix: 'G-', suffix: '-H' });
    });

    it('replaces a named nested option object rather than merging into it', async () => {
      // The merge is one level deep on purpose. Recursing would make a handler
      // unable to drop a nested field the application set, and would leave
      // "what does this handler run with" answerable only by walking a tree.
      @UsePipeline([MockBehavior, { retry: { maxAttempts: 1 } }])
      class NestedOverrideHandler {
        async execute(_cmd: MockCommand) {
          return { store: pipelineStore.getStore() };
        }
      }
      const handler = new NestedOverrideHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NestedOverrideHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: {
          before: [
            [
              MockBehavior,
              { retry: { maxAttempts: 5, backoff: 'x' }, timeout: 100 },
            ],
          ],
        },
      });

      const result = await handler.execute(new MockCommand(1));

      expect(result.store!.getBehaviorOptions(MockBehavior)).toEqual({
        retry: { maxAttempts: 1 },
        timeout: 100,
      });
    });

    it("bare handler redeclaration inherits the behavior's global options", async () => {
      const globalOpts = { mode: 'global', verbose: true };

      @UsePipeline(ConfiguredMockBehavior)
      class BareOverrideHandler {
        async execute(_cmd: MockCommand) {
          return { store: pipelineStore.getStore() };
        }
      }
      const handler = new BareOverrideHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, BareOverrideHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: { before: [[ConfiguredMockBehavior, globalOpts]] },
      });

      const result = await handler.execute(new MockCommand(1));

      expect(result.store!.getBehaviorOptions(ConfiguredMockBehavior)).toEqual(
        globalOpts,
      );
    });

    it('treats an empty handler tuple as adding nothing to the inherited options', async () => {
      @UsePipeline([ConfiguredMockBehavior, {}])
      class ExplicitDefaultsHandler {
        async execute(_cmd: MockCommand) {
          return { store: pipelineStore.getStore() };
        }
      }
      const handler = new ExplicitDefaultsHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, ExplicitDefaultsHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: {
          before: [[ConfiguredMockBehavior, { mode: 'global' }]],
        },
      });

      const result = await handler.execute(new MockCommand(1));

      expect(result.store!.getBehaviorOptions(ConfiguredMockBehavior)).toEqual({
        mode: 'global',
      });
    });

    it('keeps a global guard outside handler short-circuiting behaviors', async () => {
      const calls: string[] = [];

      class AuthorizationGuard implements IPipelineBehavior {
        async handle(_ctx: IPipelineContext, _next: NextDelegate) {
          calls.push('guard');
          throw new Error('forbidden');
        }
      }

      class CachedReplay implements IPipelineBehavior {
        async handle(_ctx: IPipelineContext, _next: NextDelegate) {
          calls.push('replay');
          return { secret: true };
        }
      }

      @UsePipeline(CachedReplay, AuthorizationGuard)
      class ProtectedHandler {
        async execute(_cmd: MockCommand) {
          calls.push('handler');
          return { secret: true };
        }
      }

      const handler = new ProtectedHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, ProtectedHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: { before: [AuthorizationGuard] },
      });

      await expect(handler.execute(new MockCommand(1))).rejects.toThrow(
        'forbidden',
      );
      expect(calls).toEqual(['guard']);
    });
  });

  describe('Dynamic DI — request-scoped behavior fallback', () => {
    it('recognizes the Nest scoped exception and reuses singleton slots around it', async () => {
      class InvalidClassScopeException extends Error {}
      @UsePipeline(MockBehavior, SecondMockBehavior)
      class Handler {
        async execute(_request: unknown) {
          return pipelineStore.getStore();
        }
      }
      const handler = new Handler();
      const singleton = new MockBehavior();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, Handler)],
      });
      moduleRefMock.get.mockImplementation((token: unknown) => {
        if (token === ExplorerService) return explorerServiceMock;
        if (token === MockBehavior) return singleton;
        throw new InvalidClassScopeException();
      });
      moduleRefMock.resolve.mockResolvedValue(new SecondMockBehavior());
      bootstrap();
      const context = await handler.execute('primitive-request');
      const detached = handler.execute;
      await expect(detached(new MockCommand(1))).resolves.toBeDefined();
      expect(context?.items.get('mock')).toBe(true);
      expect(context?.items.get('second')).toBe(true);
      expect(moduleRefMock.resolve).toHaveBeenCalledTimes(2);
      expect(moduleRefMock.resolve).toHaveBeenCalledWith(
        SecondMockBehavior,
        expect.any(Object),
        { strict: false },
      );
    });

    it('falls back to moduleRef.resolve() when a behavior cannot be resolved as singleton', async () => {
      // Use a fresh, unique class so no previous test's bootstrap has touched it.
      @UsePipeline(MockBehavior)
      class IsolatedHandler {
        async execute(_cmd: MockCommand) {
          return { store: pipelineStore.getStore() };
        }
      }
      const handler = new IsolatedHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, IsolatedHandler)],
        queries: [],
        events: [],
      });

      // Simulate request-scoped behavior: .get() throws, .resolve() succeeds.
      moduleRefMock.get.mockImplementation((token: any) => {
        if (token === ExplorerService) return explorerServiceMock;
        if (token === MockBehavior)
          throw new Error(
            'ScopedBehavior is marked as a scoped provider. Please, use "resolve()" instead.',
          );
        if (typeof token === 'function') {
          try {
            return new token();
          } catch {
            /**/
          }
        }
        throw new Error(`Unexpected: ${token?.name}`);
      });

      const resolveMock = vi.fn().mockResolvedValue(new MockBehavior());
      moduleRefMock.resolve = resolveMock;

      bootstrap();

      const result = (await handler.execute(new MockCommand(1))) as any;

      expect(resolveMock).toHaveBeenCalledWith(
        MockBehavior,
        expect.any(Object),
        {
          strict: false,
        },
      );
      expect(result.store).toBeDefined();
    });
  });

  describe('Correlation ID resolution', () => {
    it('generates a uuidv7 correlation ID when no external store is active', async () => {
      const handler = new MockCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, MockCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap();

      const result = await handler.execute(new MockCommand(1));

      expect(typeof result.store!.correlationId).toBe('string');
      expect(result.store!.correlationId.length).toBeGreaterThan(0);
      expect(isUuidV7(result.store!.correlationId)).toBe(true);
    });

    it('uses correlationIdFactory when provided', async () => {
      const handler = new MockCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, MockCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        correlationIdFactory: () => 'factory-corr-abc',
      });

      const result = await handler.execute(new MockCommand(1));

      expect(result.store!.correlationId).toBe('factory-corr-abc');
    });

    it('inherits correlationId from parent pipeline context (saga / nested dispatch)', async () => {
      const parentHandler = new MockCommandHandler();
      // A second independent singleton handler (fresh class) to avoid double-wrapping.
      class ChildCommandHandler {
        async execute(_cmd: MockCommand) {
          return { store: pipelineStore.getStore() };
        }
      }
      @UsePipeline(MockBehavior)
      class DecoratedChildHandler extends ChildCommandHandler {}

      const childHandler = new DecoratedChildHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [
          makeWrapper(parentHandler, MockCommandHandler),
          makeWrapper(childHandler, DecoratedChildHandler),
        ],
        queries: [],
        events: [],
      });

      bootstrap();

      // Run parent to get its correlation ID, then run child inside parent's store.
      const parentResult = await parentHandler.execute(new MockCommand(1));
      const parentCorrId = parentResult.store!.correlationId;

      let childCorrId: string | undefined;
      await pipelineStore.run(parentResult.store!, async () => {
        const childResult = (await childHandler.execute(
          new MockCommand(2),
        )) as any;
        childCorrId = childResult.store!.correlationId;
      });

      expect(childCorrId).toBe(parentCorrId);
    });

    it('wraps the chain with correlationIdRunner when provided', async () => {
      const handler = new MockCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, MockCommandHandler)],
        queries: [],
        events: [],
      });

      const runnerCalls: { id: string }[] = [];

      bootstrap({
        correlationIdFactory: () => 'runner-corr-id',
        correlationIdRunner: <T>(id: string, fn: () => T): T => {
          runnerCalls.push({ id });
          return fn();
        },
      });

      await handler.execute(new MockCommand(1));

      expect(runnerCalls).toHaveLength(1);
      expect(runnerCalls[0].id).toBe('runner-corr-id');
    });
  });

  describe('bootstrapLogLevel option', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let debugSpy: ReturnType<typeof vi.spyOn>;
    let verboseSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
      debugSpy = vi
        .spyOn(Logger.prototype, 'debug')
        .mockImplementation(() => {});
      verboseSpy = vi
        .spyOn(Logger.prototype, 'verbose')
        .mockImplementation(() => {});
      warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
      debugSpy.mockRestore();
      verboseSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('defaults to "debug" level when bootstrapLogLevel is not set', () => {
      const handler = new MockCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, MockCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap();

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Wrapping MockCommandHandler.execute()'),
      );
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Wrapping'),
      );
    });

    it('uses "log" level when bootstrapLogLevel is "log"', () => {
      const handler = new MockCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, MockCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        bootstrapLogLevel: 'log',
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Wrapping MockCommandHandler.execute()'),
      );
      expect(debugSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Wrapping'),
      );
    });

    it('uses "verbose" level when bootstrapLogLevel is "verbose"', () => {
      const handler = new MockCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, MockCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        bootstrapLogLevel: 'verbose',
      });

      expect(verboseSpy).toHaveBeenCalledWith(
        expect.stringContaining('Wrapping MockCommandHandler.execute()'),
      );
    });

    it('suppresses the message entirely when bootstrapLogLevel is "none"', () => {
      const handler = new MockCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, MockCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        bootstrapLogLevel: 'none',
      });

      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Wrapping'),
      );
      expect(debugSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Wrapping'),
      );
      expect(verboseSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Wrapping'),
      );
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Wrapping'),
      );
    });
  });

  describe('@SkipPipeline behavior filtering during bootstrap', () => {
    it('skips a specified global behavior for a command handler while executing remaining global behaviors', async () => {
      @SkipPipeline(MockBehavior)
      class SkipCommandHandler {
        async execute(_command: MockCommand) {
          return { ok: true, store: pipelineStore.getStore() };
        }
      }
      const handler = new SkipCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, SkipCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: { before: [MockBehavior, SecondMockBehavior] },
      });

      const result = await handler.execute(new MockCommand(1));
      expect(result.ok).toBe(true);
      expect(result.store).toBeDefined();
      expect(result.store!.items.get('mock')).toBeUndefined();
      expect(result.store!.items.get('second')).toBe(true);
      expect(SecondMockBehavior.callCount).toBe(1);
    });

    it('skips all global behaviors leaving handler completely unwrapped', async () => {
      @SkipPipeline(MockBehavior)
      class SkipAllCommandHandler {
        async execute(_command: MockCommand) {
          return { ok: true, store: pipelineStore.getStore() };
        }
      }
      const handler = new SkipAllCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, SkipAllCommandHandler)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: { before: [MockBehavior] },
      });

      const result = await handler.execute(new MockCommand(1));
      expect(result.ok).toBe(true);
      expect(result.store).toBeUndefined();
    });

    it('skips a global behavior for query and event handlers', async () => {
      @SkipPipeline(MockBehavior)
      class SkipQueryHandler {
        async execute(query: MockQuery) {
          return { id: query.id, store: pipelineStore.getStore() };
        }
      }

      @SkipPipeline(MockBehavior)
      class SkipEventHandler {
        async handle(event: MockEvent) {
          return { payload: event.payload, store: pipelineStore.getStore() };
        }
      }

      const qHandler = new SkipQueryHandler();
      const evHandler = new SkipEventHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [],
        queries: [makeWrapper(qHandler, SkipQueryHandler)],
        events: [makeWrapper(evHandler, SkipEventHandler)],
      });

      bootstrap({
        globalBehaviors: { before: [MockBehavior, SecondMockBehavior] },
      });

      const qResult = await qHandler.execute(new MockQuery(42));
      expect(qResult.store!.items.get('mock')).toBeUndefined();
      expect(qResult.store!.items.get('second')).toBe(true);

      const evResult = await evHandler.handle(new MockEvent('test'));
      expect(evResult.store!.items.get('mock')).toBeUndefined();
      expect(evResult.store!.items.get('second')).toBe(true);
    });

    it('skips a global behavior for request-scoped handlers', async () => {
      @SkipPipeline(MockBehavior)
      class ScopedSkipCommandHandler {
        async execute(_command: MockCommand) {
          return { scoped: true, store: pipelineStore.getStore() };
        }
      }

      const handler = new ScopedSkipCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, ScopedSkipCommandHandler, 2)],
        queries: [],
        events: [],
      });

      bootstrap({
        globalBehaviors: { before: [MockBehavior, SecondMockBehavior] },
      });

      const freshInstance = new ScopedSkipCommandHandler();
      const result = (await freshInstance.execute(new MockCommand(5))) as any;
      expect(result.scoped).toBe(true);
      expect(result.store).toBeDefined();
      expect(result.store.items.get('mock')).toBeUndefined();
      expect(result.store.items.get('second')).toBe(true);
    });

    it('throws descriptive error during bootstrap when @SkipPipeline and @UsePipeline contradict', () => {
      @SkipPipeline(MockBehavior)
      @UsePipeline(MockBehavior)
      class ContradictoryHandler {
        async execute(_command: MockCommand) {
          return {};
        }
      }

      const handler = new ContradictoryHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, ContradictoryHandler)],
        queries: [],
        events: [],
      });

      expect(() =>
        bootstrap({
          globalBehaviors: { before: [MockBehavior] },
        }),
      ).toThrowError(/contradictory pipeline configuration/i);
    });

    it('skips a behavior identified by PIPELINE_BEHAVIOR_ID', async () => {
      class CustomSkipBehavior implements IPipelineBehavior {
        static readonly [PIPELINE_BEHAVIOR_ID] = 'custom:skip-me';
        async handle(ctx: IPipelineContext, next: NextDelegate) {
          ctx.items.set('custom', true);
          return next();
        }
      }

      @SkipPipeline(CustomSkipBehavior)
      class CustomSkipHandler {
        async execute(_cmd: MockCommand) {
          return { store: pipelineStore.getStore() };
        }
      }

      const handler = new CustomSkipHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, CustomSkipHandler)],
        queries: [],
        events: [],
      });

      moduleRefMock.get.mockImplementation((token: any) => {
        if (token === ExplorerService) return explorerServiceMock;
        if (token === CustomSkipBehavior) return new CustomSkipBehavior();
        if (token === SecondMockBehavior) return new SecondMockBehavior();
        return undefined;
      });

      bootstrap({
        globalBehaviors: { before: [CustomSkipBehavior, SecondMockBehavior] },
      });

      const result = (await handler.execute(new MockCommand(1))) as any;
      expect(result.store!.items.get('custom')).toBeUndefined();
      expect(result.store!.items.get('second')).toBe(true);
    });
  });
});
