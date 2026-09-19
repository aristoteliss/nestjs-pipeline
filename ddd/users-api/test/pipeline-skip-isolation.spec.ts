/* Copyright (C) 2026-present Aristotelis — see repository license. */
import {
  type INestApplicationContext,
  Injectable,
  Scope,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CommandBus, CommandHandler, CqrsModule } from '@nestjs/cqrs';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  PipelineModule,
  pipelineStore,
  SkipPipeline,
} from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';

class IsolatedCommand {}

@Injectable()
class SkippedBehavior implements IPipelineBehavior {
  async handle(_context: IPipelineContext, next: NextDelegate) {
    return { unexpected: await next() };
  }
}

@Injectable()
class MarkerBehavior implements IPipelineBehavior {
  async handle(_context: IPipelineContext, next: NextDelegate) {
    return { marker: true, result: await next() };
  }
}

@CommandHandler(IsolatedCommand, { scope: Scope.REQUEST })
@SkipPipeline(SkippedBehavior)
class SharedHandler {
  async execute() {
    return { value: 'handler', hasContext: Boolean(pipelineStore.getStore()) };
  }
}

async function start(marked: boolean) {
  return NestFactory.createApplicationContext(
    {
      module: class AppModule {},
      imports: [
        CqrsModule.forRoot(),
        PipelineModule.forRoot({
          globalBehaviors: {
            before: marked
              ? [SkippedBehavior, MarkerBehavior]
              : [SkippedBehavior],
          },
        }),
      ],
      providers: [SharedHandler],
    },
    { logger: false, abortOnError: false },
  );
}

const execute = (app: INestApplicationContext) =>
  app.get(CommandBus).execute(new IsolatedCommand());
const markedResult = {
  marker: true,
  result: { value: 'handler', hasContext: true },
};
const skippedResult = { value: 'handler', hasContext: false };

describe('SkipPipeline application isolation', () => {
  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])(
    'isolates scoped handlers (marked boots first: %s, marked closes first: %s)',
    async (markedFirst, closeMarkedFirst) => {
      const first = await start(markedFirst);
      let second: INestApplicationContext | undefined;
      let closed: INestApplicationContext | undefined;
      try {
        // Resolve an instance before the other application patches the shared prototype.
        expect(await execute(first)).toEqual(
          markedFirst ? markedResult : skippedResult,
        );
        second = await start(!markedFirst);
        const marked = markedFirst ? first : second;
        const skipped = markedFirst ? second : first;
        expect(await execute(marked)).toEqual(markedResult);
        expect(await execute(skipped)).toEqual(skippedResult);
        closed = closeMarkedFirst ? marked : skipped;
        await closed.close();
        expect(await execute(closeMarkedFirst ? skipped : marked)).toEqual(
          closeMarkedFirst ? skippedResult : markedResult,
        );
      } finally {
        if (second && second !== closed) await second.close();
        if (first !== closed) await first.close();
      }
    },
  );
});
