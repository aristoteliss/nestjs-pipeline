/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncContext } from '@nestjs/cqrs';
import { ExplorerService } from '@nestjs/cqrs/dist/services/explorer.service';
import { describe, expect, it, vi } from 'vitest';
import { pipelineStore } from '../constants/pipeline-context.constants';
import { UsePipeline } from '../decorators/pipeline.decorator';
import type {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import type { IPipelineContext } from '../interfaces/pipeline.context.interface';
import { PipelineBootstrapService } from './pipeline.bootstrap.service';

class ScopedBehavior implements IPipelineBehavior {
  async handle(_context: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

class TestCommand {}

@UsePipeline(ScopedBehavior)
class RequestScopedHandler {
  async execute(_command: TestCommand) {
    return 'ok';
  }
}

describe('PipelineBootstrapService scoped CQRS context', () => {
  it('resolves dynamic behaviors with the same AsyncContext id as the scoped handler', async () => {
    const explorer = {
      explore: vi.fn().mockReturnValue({
        commands: [
          {
            instance: undefined,
            metatype: RequestScopedHandler,
            scope: 2,
            isDependencyTreeStatic: vi.fn(() => false),
          },
        ],
        queries: [],
        events: [],
      }),
    };
    const resolved = new ScopedBehavior();
    const resolve = vi.fn().mockResolvedValue(resolved);
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === ExplorerService) return explorer;
        if (token === ScopedBehavior) {
          throw new Error(
            'ScopedBehavior is marked as a scoped provider. Please, use "resolve()" instead.',
          );
        }
        throw new Error('unexpected token');
      }),
      resolve,
    };

    new PipelineBootstrapService(moduleRef as never).onApplicationBootstrap();

    const asyncContext = new AsyncContext();
    const command = new TestCommand();
    asyncContext.attachTo(command);

    await new RequestScopedHandler().execute(command);

    expect(resolve).toHaveBeenCalledWith(ScopedBehavior, asyncContext.id, {
      strict: false,
    });
  });
});

describe('PipelineBootstrapService with several applications', () => {
  class SharedCommand {}

  class TagBehavior implements IPipelineBehavior {
    constructor(private readonly tag: string) {}
    async handle(context: IPipelineContext, next: NextDelegate) {
      context.items.set('tag', this.tag);
      return next();
    }
  }

  @UsePipeline(TagBehavior)
  class SharedHandler {
    async execute(_command: SharedCommand) {
      return pipelineStore.getStore()?.items.get('tag') ?? 'no-pipeline';
    }
  }

  function bootstrapApp(tag: string) {
    const wrapper = {
      metatype: SharedHandler,
      instance: undefined,
      isDependencyTreeStatic: () => false,
      getInstanceByContextId: undefined,
      setInstanceByContextId: undefined,
    };
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === TagBehavior) return new TagBehavior(tag);
        return {
          explore: () => ({ commands: [wrapper], queries: [], events: [] }),
        };
      }),
      resolve: vi.fn(),
    };
    const service = new PipelineBootstrapService(moduleRef as never, {});
    service.onApplicationBootstrap();
    return service;
  }

  it("runs a single application's chain when there is no ambiguity", async () => {
    const app = bootstrapApp('app-a');
    try {
      await expect(
        new SharedHandler().execute(new SharedCommand()),
      ).resolves.toBe('app-a');
    } finally {
      app.onModuleDestroy();
    }
  });

  it('refuses to guess a chain when two applications share the prototype', async () => {
    const appA = bootstrapApp('app-a');
    const appB = bootstrapApp('app-b');

    try {
      // Running unwrapped loses the pipeline for this call, which is recoverable
      // and diagnosable. Silently applying the other application's chain is not.
      await expect(
        new SharedHandler().execute(new SharedCommand()),
      ).resolves.toBe('no-pipeline');
    } finally {
      appB.onModuleDestroy();
      appA.onModuleDestroy();
    }
  });

  it('restores unambiguous dispatch once the second application is destroyed', async () => {
    const appA = bootstrapApp('app-a');
    const appB = bootstrapApp('app-b');
    appB.onModuleDestroy();

    try {
      await expect(
        new SharedHandler().execute(new SharedCommand()),
      ).resolves.toBe('app-a');
    } finally {
      appA.onModuleDestroy();
    }
  });
});
