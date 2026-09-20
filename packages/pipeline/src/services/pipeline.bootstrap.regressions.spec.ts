/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ExplorerService } from '@nestjs/cqrs/dist/services/explorer.service';
import { describe, expect, it } from 'vitest';
import { UsePipeline } from '../decorators/pipeline.decorator';
import type {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import type { IPipelineContext } from '../interfaces/pipeline.context.interface';
import { PIPELINE_BEHAVIOR_CONTRACT } from '../interfaces/pipeline-behavior-contract.interface';
import { PipelineBootstrapService } from './pipeline.bootstrap.service';

class TagBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate) {
    return [context.handlerName, await next()];
  }
}

function scoped(handler: new () => object) {
  return { metatype: handler, isDependencyTreeStatic: () => false };
}

function bootstrap(
  commands: object[],
  behaviors = new Map<unknown, IPipelineBehavior>([
    [TagBehavior, new TagBehavior()],
  ]),
) {
  return new PipelineBootstrapService(
    {
      get(token: unknown) {
        if (token === ExplorerService) return { explore: () => ({ commands }) };
        if (behaviors.has(token)) return behaviors.get(token);
        throw new Error('missing provider');
      },
    } as never,
    { bootstrapLogLevel: 'none' },
  );
}

describe('bootstrap rollback and inheritance', () => {
  it.each([false, true])(
    'restores descriptors and the prototype chain (child first: %s)',
    async (childFirst) => {
      @UsePipeline(TagBehavior)
      class Parent {
        async execute(_request: object) {
          return 'done';
        }
      }
      @UsePipeline(TagBehavior)
      class Child extends Parent {}
      const descriptor = Object.getOwnPropertyDescriptor(
        Parent.prototype,
        'execute',
      );
      const service = bootstrap(
        (childFirst ? [Child, Parent] : [Parent, Child]).map(scoped),
      );
      try {
        service.onApplicationBootstrap();
        await expect(new Child().execute({})).resolves.toEqual([
          'Child',
          'done',
        ]);
        await expect(new Parent().execute({})).resolves.toEqual([
          'Parent',
          'done',
        ]);
      } finally {
        service.onModuleDestroy();
      }
      expect(Object.hasOwn(Child.prototype, 'execute')).toBe(false);
      expect(
        Object.getOwnPropertyDescriptor(Parent.prototype, 'execute'),
      ).toEqual(descriptor);
    },
  );

  it('rolls back singleton and scoped patches when contract diagnostics reject bootstrap', () => {
    class InvalidBehavior extends TagBehavior {
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
    }
    @UsePipeline(TagBehavior)
    class Handler {
      async execute() {
        return 'done';
      }
    }
    @UsePipeline(InvalidBehavior)
    class InvalidHandler extends Handler {}
    const singleton = new Handler();
    const original = Handler.prototype.execute;
    const service = bootstrap(
      [
        {
          metatype: Handler,
          instance: singleton,
          isDependencyTreeStatic: () => true,
        },
        scoped(InvalidHandler),
      ],
      new Map([
        [TagBehavior, new TagBehavior()],
        [InvalidBehavior, new InvalidBehavior()],
      ]),
    );
    expect(() => service.onApplicationBootstrap()).toThrow(
      /Pipeline configuration invalid/,
    );
    expect(singleton.execute).toBe(original);
    expect(Object.hasOwn(singleton, 'execute')).toBe(false);
    expect(Object.hasOwn(InvalidHandler.prototype, 'execute')).toBe(false);
    service.onModuleDestroy();
  });

  it('rolls back only the failing application while another owns the same prototype', async () => {
    @UsePipeline(TagBehavior)
    class Shared {
      async execute(_request: object) {
        return 'done';
      }
    }
    class MissingBehavior extends TagBehavior {}
    @UsePipeline(MissingBehavior)
    class Broken extends Shared {}
    const original = Shared.prototype.execute;
    const live = bootstrap([scoped(Shared)]);
    live.onApplicationBootstrap();
    const installed = Shared.prototype.execute;
    const failed = bootstrap([scoped(Shared), scoped(Broken)]);
    try {
      expect(() => failed.onApplicationBootstrap()).toThrow(/MissingBehavior/);
      expect(Shared.prototype.execute).toBe(installed);
      await expect(new Shared().execute({})).resolves.toEqual([
        'Shared',
        'done',
      ]);
      failed.onModuleDestroy();
      await expect(new Shared().execute({})).resolves.toEqual([
        'Shared',
        'done',
      ]);
    } finally {
      live.onModuleDestroy();
    }
    expect(Shared.prototype.execute).toBe(original);
  });
});
