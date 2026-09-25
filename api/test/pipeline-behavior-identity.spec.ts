/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Bootstrap contracts exercised against a real Nest application. These live
 * here rather than in `@nestjs-pipeline/core` because a published package must
 * not depend on `@nestjs/testing`.
 *
 * Behavior identity is the class, not its name: two unrelated classes that share
 * a name, one per module, are two behaviors. Merged, only one would run, with
 * the other's options, and a security guard could leave the chain unnoticed.
 *
 * Provider resolution treats only Nest's scoped-provider error as a scoping
 * problem, so an unregistered behavior fails at bootstrap, not on the first
 * request.
 */

import { Injectable } from '@nestjs/common';
import { CommandBus, CommandHandler, CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  PipelineModule,
  UsePipeline,
} from '@nestjs-pipeline/core';
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
      imports: [
        CqrsModule.forRoot(),
        PipelineModule.forRoot({ behaviors: [FirstLogging, SecondLogging] }),
      ],
      providers: [DoThingHandler],
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
      /UnregisteredBehavior could not be resolved from the Nest container/,
    );

    await app.close().catch(() => undefined);
  });
});
