/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Bootstrap contracts exercised against a real Nest application. These live
 * here rather than in `@cqrs-ddd/pipeline` because a published package must
 * not depend on `@nestjs/testing`.
 *
 * Behavior identity is the class, not its name: two unrelated classes that share
 * a name, one per module, are two behaviors. Merged, only one would run, with
 * the other's options, and a security guard could leave the chain unnoticed.
 *
 * Each behavior instance is the one provider a module registers under the
 * behavior class: a behavior no module provides, or one two modules provide,
 * fails at bootstrap, not on the first request, and never depends on the order
 * modules are imported in.
 */

import { PipelineModule } from '@cqrs-ddd/nestjs';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  UsePipeline,
} from '@cqrs-ddd/pipeline';
import { Injectable, Module } from '@nestjs/common';
import { CommandBus, CommandHandler, CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

const order: string[] = [];

/** Builds a distinct class that deliberately reuses the same class name. */
function makeNamedBehavior(tag: string) {
  @Injectable()
  class LoggingBehavior implements IPipelineBehavior {
    async handle(context: IPipelineContext, next: NextDelegate) {
      const options = context.getBehaviorOptions<{ label?: string }>(
        LoggingBehavior,
      );
      order.push(`${tag}:${options?.label ?? 'none'}`);
      return next();
    }
  }
  return LoggingBehavior;
}

const FirstLogging = makeNamedBehavior('first');
const SecondLogging = makeNamedBehavior('second');

class DoThingCommand {}

@CommandHandler(DoThingCommand)
@UsePipeline([FirstLogging, { label: 'a' }], [SecondLogging, { label: 'b' }])
class DoThingHandler {
  async execute() {
    return 'done';
  }
}

@Injectable()
class UnregisteredBehavior implements IPipelineBehavior {
  async handle(_context: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

class OtherCommand {}

@CommandHandler(OtherCommand)
@UsePipeline(UnregisteredBehavior)
class OtherHandler {
  async execute() {
    return 'done';
  }
}

describe('pipeline behavior identity', () => {
  beforeEach(() => {
    order.length = 0;
  });

  it('runs both same-named behaviors with their own options', async () => {
    expect(FirstLogging.name).toBe(SecondLogging.name);

    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule.forRoot(), PipelineModule.forRoot()],
      providers: [DoThingHandler, FirstLogging, SecondLogging],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    try {
      await app.get(CommandBus).execute(new DoThingCommand());
      // Name-keyed identity collapsed these into one entry, so only one ran and
      // it read the other's options.
      expect(order).toEqual(['first:a', 'second:b']);
    } finally {
      await app.close();
    }
  });
});

describe('pipeline provider registration', () => {
  it('fails at bootstrap when a declared behavior is not registered', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule.forRoot(), PipelineModule.forRoot()],
      providers: [OtherHandler],
    }).compile();
    const app = moduleRef.createNestApplication();

    await expect(app.init()).rejects.toThrow(
      /UnregisteredBehavior runs in the pipeline of OtherHandler, but no module provides it/,
    );

    await app.close().catch(() => undefined);
  });

  it('fails at bootstrap when two modules provide the same behavior, naming both', async () => {
    @Injectable()
    class GuardBehavior implements IPipelineBehavior {
      async handle(_context: IPipelineContext, next: NextDelegate) {
        return next();
      }
    }

    class GuardedCommand {}

    @CommandHandler(GuardedCommand)
    @UsePipeline(GuardBehavior)
    class GuardedHandler {
      async execute() {
        return 'done';
      }
    }

    @Module({ providers: [GuardBehavior] })
    class ObservabilityModule {}

    @Module({ providers: [GuardBehavior] })
    class ReliabilityModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        CqrsModule.forRoot(),
        PipelineModule.forRoot(),
        ObservabilityModule,
        ReliabilityModule,
      ],
      providers: [GuardedHandler],
    }).compile();
    const app = moduleRef.createNestApplication();

    await expect(app.init()).rejects.toThrow(
      /GuardBehavior is provided by (ObservabilityModule and ReliabilityModule|ReliabilityModule and ObservabilityModule)/,
    );

    await app.close().catch(() => undefined);
  });
});
