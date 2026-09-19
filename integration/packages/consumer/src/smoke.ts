import 'reflect-metadata';
import { Injectable, Module, Scope } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  CommandBus,
  CommandHandler,
  CqrsModule,
  type ICommandHandler,
} from '@nestjs/cqrs';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  PipelineModule,
  UsePipeline,
} from '@nestjs-pipeline/core';

class SmokeCommand {
  constructor(readonly value: string) {}
}

@Injectable({ scope: Scope.REQUEST })
class MarkerBehavior implements IPipelineBehavior {
  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    context.items.set('packed-consumer', true);
    return `behavior:${await next()}`;
  }
}

@CommandHandler(SmokeCommand)
@UsePipeline(MarkerBehavior)
class SmokeHandler implements ICommandHandler<SmokeCommand> {
  async execute(command: SmokeCommand): Promise<string> {
    return `ok:${command.value}`;
  }
}

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({ behaviors: [MarkerBehavior] }),
  ],
  providers: [SmokeHandler, MarkerBehavior],
})
class SmokeModule {}

async function run() {
  const app = await NestFactory.createApplicationContext(SmokeModule, {
    logger: false,
  });

  try {
    const result = await app
      .get(CommandBus)
      .execute(new SmokeCommand('packed'));

    if (result !== 'behavior:ok:packed') {
      throw new Error(`Unexpected packed-consumer result: ${String(result)}`);
    }
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error(err);
  throw err;
});
