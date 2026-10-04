import 'reflect-metadata';
import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import { ErrorFilter, PipelineModule, toHttpException } from '@cqrs-ddd/nestjs';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  UsePipeline,
} from '@cqrs-ddd/pipeline';
import { Injectable, Module } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import {
  CommandBus,
  CommandHandler,
  CqrsModule,
  type ICommandHandler,
} from '@nestjs/cqrs';
import * as facade from '@nestjs-pipeline/cqrs-ddd';

class SmokeCommand {
  constructor(readonly value: string) {}
}

@Injectable()
class MarkerBehavior implements IPipelineBehavior {
  async handle(_context: IPipelineContext, next: NextDelegate) {
    return `behavior:${await next()}`;
  }
}

@CommandHandler(SmokeCommand)
@UsePipeline(MarkerBehavior)
class SmokeHandler implements ICommandHandler<SmokeCommand> {
  async execute(command: SmokeCommand) {
    return command.value;
  }
}

@Module({
  imports: [CqrsModule.forRoot(), PipelineModule.forRoot()],
  providers: [
    MarkerBehavior,
    SmokeHandler,
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
class SmokeModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(SmokeModule, {
    logger: false,
  });
  const result = await app.get(CommandBus).execute(new SmokeCommand('packed'));
  await app.close();
  if (result !== 'behavior:packed') {
    throw new Error(
      `Expected the packed adapter to run the pipeline, got ${result}`,
    );
  }

  const status = toHttpException(
    new EntityNotFoundException('User', 'u-1'),
  )?.getStatus();
  if (status !== 404) {
    throw new Error(
      `Expected a core domain error to answer 404, got ${status}`,
    );
  }
  if (facade.PipelineModule !== PipelineModule) {
    throw new Error('The facade must re-export @cqrs-ddd/nestjs unchanged');
  }
  console.log('packed @cqrs-ddd/nestjs smoke passed');
}

main().catch((error: unknown) => {
  console.error(error);
  throw error;
});
