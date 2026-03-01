import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineBootstrapService } from './pipeline.bootstrap.service';
import { ExplorerService } from '@nestjs/cqrs/dist/services/explorer.service';
import { IPipelineBehavior, NextDelegate } from '../interfaces/pipeline.behavior.interface';
import { IPipelineContext } from '../interfaces/pipeline.context.interface';
import { UsePipeline } from '../decorators/pipeline.decorator';
import { pipelineStore } from '../constants/pipeline-context.constants';
import { correlationStore } from '../correlation/correlation.store';

// ─────────────────────────────────────────────────────────────────
// Behaviors
// ─────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────
// Commands / Queries / Events
// ─────────────────────────────────────────────────────────────────

class MockCommand {
  constructor(public id: number) {}
}

class MockQuery {
  constructor(public id: number) {}
}

class MockEvent {
  constructor(public payload: string) {}
}

// ─────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────

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
    return { eventHandled: true, payload: event.payload, store: pipelineStore.getStore() };
  }
}

// ─────────────────────────────────────────────────────────────────
// Helper — build a minimal InstanceWrapper-like object
// scope 0 = Scope.DEFAULT (singleton), 1 = TRANSIENT, 2 = REQUEST
// ─────────────────────────────────────────────────────────────────

function makeWrapper(instance: any, metatype: any, scope = 0) {
  return { instance, metatype, scope };
}

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

describe('PipelineBootstrapService', () => {
  let moduleRefMock: any;
  let explorerServiceMock: any;

  beforeEach(() => {
    SecondMockBehavior.callCount = 0;

    explorerServiceMock = {
      explore: vi.fn().mockReturnValue({ commands: [], queries: [], events: [] }),
    };

    moduleRefMock = {
      get: vi.fn((token: any) => {
        if (token === ExplorerService) return explorerServiceMock;
        if (token === MockBehavior) return new MockBehavior();
        if (token === SecondMockBehavior) return new SecondMockBehavior();
        if (typeof token === 'function') { try { return new (token)(); } catch { /**/ } }
        throw new Error(`Unexpected DI token: ${token?.name ?? token}`);
      }),
      resolve: vi.fn(),
    };
  });

  // ─────────────────────────────────────────────────────────────────
  describe('Core singleton wrapping', () => {
    it('wraps execute() and runs the full behavior chain', async () => {
      const handler = new MockCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, MockCommandHandler)],
        queries: [], events: [],
      });

      new PipelineBootstrapService(moduleRefMock).onApplicationBootstrap();

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
        queries: [], events: [],
      });

      new PipelineBootstrapService(moduleRefMock).onApplicationBootstrap();

      const result = await handler.execute(new MockCommand(1));
      expect(result.store).toBeUndefined();
    });

    it('skips a singleton wrapper whose instance is undefined (early-return guard)', () => {
      // scope 0 = DEFAULT = isScoped false. No instance → should skip silently.
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(undefined, MockCommandHandler, 0)],
        queries: [], events: [],
      });
      expect(() =>
        new PipelineBootstrapService(moduleRefMock).onApplicationBootstrap(),
      ).not.toThrow();
    });

    it('skips a wrapper where both metatype and instance are undefined', () => {
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(undefined, undefined, 0)],
        queries: [], events: [],
      });
      expect(() =>
        new PipelineBootstrapService(moduleRefMock).onApplicationBootstrap(),
      ).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('Query and Event handler wrapping', () => {
    it('wraps query handler.execute() and sets requestKind to "query"', async () => {
      const handler = new MockQueryHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [], events: [],
        queries: [makeWrapper(handler, MockQueryHandler)],
      });

      new PipelineBootstrapService(moduleRefMock).onApplicationBootstrap();

      const result = await handler.execute(new MockQuery(99));

      expect(result.queryResult).toBe(true);
      expect(result.id).toBe(99);
      expect(result.store!.requestKind).toBe('query');
      expect(result.store!.items.get('mock')).toBe(true);
    });

    it('wraps event handler.handle() (not execute) and sets requestKind to "event"', async () => {
      const handler = new MockEventHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [], queries: [],
        events: [makeWrapper(handler, MockEventHandler)],
      });

      new PipelineBootstrapService(moduleRefMock).onApplicationBootstrap();

      const result = await handler.handle(new MockEvent('hello'));

      expect(result.eventHandled).toBe(true);
      expect(result.payload).toBe('hello');
      expect(result.store!.requestKind).toBe('event');
      expect(result.store!.items.get('mock')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('Scoped handlers (REQUEST scope: 2, TRANSIENT scope: 1)', () => {
    it('patches the prototype for REQUEST-scoped handlers (scope: 2)', async () => {
      // At bootstrap, instance is undefined for scoped providers.
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(undefined, ScopedCommandHandler, 2)],
        queries: [], events: [],
      });

      new PipelineBootstrapService(moduleRefMock, {
        globalBehaviors: { before: [MockBehavior] },
      }).onApplicationBootstrap();

      // A freshly-created instance inherits the patched prototype.
      const freshInstance = new ScopedCommandHandler();
      const result = await freshInstance.execute(new MockCommand(5)) as any;

      // Pipeline context must be active → proves prototype was patched
      expect(result.store).toBeDefined();
      expect(result.store!.requestKind).toBe('command');
      expect(result.store!.items.get('mock')).toBe(true);
    });

    it('patches the prototype for TRANSIENT-scoped handlers (scope: 1)', async () => {
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(undefined, ScopedCommandHandler, 1)],
        queries: [], events: [],
      });

      new PipelineBootstrapService(moduleRefMock, {
        globalBehaviors: { before: [MockBehavior] },
      }).onApplicationBootstrap();

      const freshInstance = new ScopedCommandHandler();
      const result = await freshInstance.execute(new MockCommand(3)) as any;

      expect(result.store).toBeDefined();
      expect(result.store!.items.get('mock')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('Global behaviors — handler-kind scope filtering', () => {
    it('applies global behaviors to commands when scope is "commands"', async () => {
      const handler = new NoPipelineCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NoPipelineCommandHandler)],
        queries: [], events: [],
      });

      new PipelineBootstrapService(moduleRefMock, {
        globalBehaviors: { scope: 'commands', before: [MockBehavior] },
      }).onApplicationBootstrap();

      const result = await handler.execute(new MockCommand(1));
      expect(result.store).toBeDefined();
      expect(result.store!.items.get('mock')).toBe(true);
    });

    it('does NOT apply scope:"commands" global behaviors to queries', async () => {
      class PlainQueryHandler {
        async execute(_q: MockQuery) { return { store: pipelineStore.getStore() }; }
      }
      const handler = new PlainQueryHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [],
        queries: [makeWrapper(handler, PlainQueryHandler)],
        events: [],
      });

      new PipelineBootstrapService(moduleRefMock, {
        globalBehaviors: { scope: 'commands', before: [MockBehavior] },
      }).onApplicationBootstrap();

      const result = await handler.execute(new MockQuery(1));
      expect(result.store).toBeUndefined();
    });

    it('does NOT apply scope:"queries" global behaviors to commands', async () => {
      const handler = new NoPipelineCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NoPipelineCommandHandler)],
        queries: [], events: [],
      });

      new PipelineBootstrapService(moduleRefMock, {
        globalBehaviors: { scope: 'queries', before: [MockBehavior] },
      }).onApplicationBootstrap();

      const result = await handler.execute(new MockCommand(1));
      expect(result.store).toBeUndefined();
    });

    it('does NOT apply scope:"events" global behaviors to commands', async () => {
      const handler = new NoPipelineCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, NoPipelineCommandHandler)],
        queries: [], events: [],
      });

      new PipelineBootstrapService(moduleRefMock, {
        globalBehaviors: { scope: 'events', before: [MockBehavior] },
      }).onApplicationBootstrap();

      const result = await handler.execute(new MockCommand(1));
      expect(result.store).toBeUndefined();
    });

    it('applies global behaviors to all handler kinds when scope is "all" (default)', async () => {
      class PlainQueryHandler2 {
        async execute(_q: MockQuery) { return { store: pipelineStore.getStore() }; }
      }
      class PlainEventHandler2 {
        async handle(_e: MockEvent) { return pipelineStore.getStore(); }
      }

      const cmdHandler = new NoPipelineCommandHandler();
      const qHandler   = new PlainQueryHandler2();
      const evHandler  = new PlainEventHandler2();

      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(cmdHandler, NoPipelineCommandHandler)],
        queries:  [makeWrapper(qHandler, PlainQueryHandler2)],
        events:   [makeWrapper(evHandler, PlainEventHandler2)],
      });

      // Omitting scope exercises the 'all' default code path.
      new PipelineBootstrapService(moduleRefMock, {
        globalBehaviors: { before: [MockBehavior] },
      }).onApplicationBootstrap();

      const cmdResult = await cmdHandler.execute(new MockCommand(1));
      const qResult   = await qHandler.execute(new MockQuery(1));
      const evStore   = await evHandler.handle(new MockEvent('e'));

      expect(cmdResult.store).toBeDefined();
      expect(qResult.store).toBeDefined();
      expect(evStore).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('Deduplication — same behavior in @UsePipeline and globalBehaviors', () => {
    it('runs the behavior only once when it appears in both @UsePipeline and global before', async () => {
      @UsePipeline(SecondMockBehavior)
      class DedupHandler {
        async execute(_cmd: MockCommand) { return pipelineStore.getStore(); }
      }
      const handler = new DedupHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, DedupHandler)],
        queries: [], events: [],
      });

      new PipelineBootstrapService(moduleRefMock, {
        // Same class as @UsePipeline — global entry must be dropped.
        globalBehaviors: { before: [SecondMockBehavior] },
      }).onApplicationBootstrap();

      await handler.execute(new MockCommand(1));

      // If deduplication failed, callCount would be 2.
      expect(SecondMockBehavior.callCount).toBe(1);
    });

    it('handler-level options override global options for the same behavior', async () => {
      const globalOpts = { level: 'info', prefix: 'G-' };
      const localOpts  = { level: 'debug', suffix: '-H' };

      @UsePipeline([MockBehavior, localOpts])
      class OverrideHandler {
        async execute(_cmd: MockCommand) { return { store: pipelineStore.getStore() }; }
      }
      const handler = new OverrideHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, OverrideHandler)],
        queries: [], events: [],
      });

      new PipelineBootstrapService(moduleRefMock, {
        globalBehaviors: { before: [[MockBehavior, globalOpts]] },
      }).onApplicationBootstrap();

      const result = await handler.execute(new MockCommand(1));

      const opts = result.store!.getBehaviorOptions(MockBehavior);
      expect(opts).toEqual({ level: 'debug', suffix: '-H' });
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('Dynamic DI — request-scoped behavior fallback', () => {
    it('falls back to moduleRef.resolve() when a behavior cannot be resolved as singleton', async () => {
      // Use a fresh, unique class so no previous test's bootstrap has touched it.
      @UsePipeline(MockBehavior)
      class IsolatedHandler {
        async execute(_cmd: MockCommand) { return { store: pipelineStore.getStore() }; }
      }
      const handler = new IsolatedHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, IsolatedHandler)],
        queries: [], events: [],
      });

      // Simulate request-scoped behavior: .get() throws, .resolve() succeeds.
      moduleRefMock.get.mockImplementation((token: any) => {
        if (token === ExplorerService) return explorerServiceMock;
        if (token === MockBehavior) throw new Error('Not a singleton — use resolve()');
        if (typeof token === 'function') { try { return new (token)(); } catch { /**/ } }
        throw new Error(`Unexpected: ${token?.name}`);
      });

      const resolveMock = vi.fn().mockResolvedValue(new MockBehavior());
      moduleRefMock.resolve = resolveMock;

      new PipelineBootstrapService(moduleRefMock).onApplicationBootstrap();

      const result = await handler.execute(new MockCommand(1)) as any;

      expect(resolveMock).toHaveBeenCalledWith(MockBehavior, undefined, { strict: false });
      expect(result.store).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  describe('Correlation ID resolution', () => {
    it('generates a uuidv7 correlation ID when no external store is active', async () => {
      const handler = new MockCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, MockCommandHandler)],
        queries: [], events: [],
      });

      new PipelineBootstrapService(moduleRefMock).onApplicationBootstrap();

      const result = await handler.execute(new MockCommand(1));

      expect(typeof result.store!.correlationId).toBe('string');
      expect(result.store!.correlationId.length).toBeGreaterThan(0);
    });

    it('inherits correlationId from correlationStore when active (HTTP middleware / Bull)', async () => {
      const handler = new MockCommandHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [makeWrapper(handler, MockCommandHandler)],
        queries: [], events: [],
      });

      new PipelineBootstrapService(moduleRefMock).onApplicationBootstrap();

      let captured: string | undefined;
      await correlationStore.run('http-corr-abc', async () => {
        const result = await handler.execute(new MockCommand(1));
        captured = result.store!.originalCorrelationId;
      });

      expect(captured).toBe('http-corr-abc');
    });

    it('inherits correlationId from parent pipeline context (saga / nested dispatch)', async () => {
      const parentHandler = new MockCommandHandler();
      // A second independent singleton handler (fresh class) to avoid double-wrapping.
      class ChildCommandHandler {
        async execute(_cmd: MockCommand) { return { store: pipelineStore.getStore() }; }
      }
      @UsePipeline(MockBehavior)
      class DecoratedChildHandler extends ChildCommandHandler {}

      const childHandler = new DecoratedChildHandler();
      explorerServiceMock.explore.mockReturnValue({
        commands: [
          makeWrapper(parentHandler, MockCommandHandler),
          makeWrapper(childHandler, DecoratedChildHandler),
        ],
        queries: [], events: [],
      });

      new PipelineBootstrapService(moduleRefMock).onApplicationBootstrap();

      // Run parent to get its correlation ID, then run child inside parent's store.
      const parentResult = await parentHandler.execute(new MockCommand(1));
      const parentCorrId = parentResult.store!.correlationId;

      let childCorrId: string | undefined;
      await pipelineStore.run(parentResult.store!, async () => {
        const childResult = await childHandler.execute(new MockCommand(2)) as any;
        childCorrId = childResult.store!.correlationId;
      });

      expect(childCorrId).toBe(parentCorrId);
    });
  });
});
