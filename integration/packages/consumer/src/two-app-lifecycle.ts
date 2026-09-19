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

class LifecycleCommand {
  constructor(readonly value: string) {}
}

let app1BehaviorRan = false;
let app2BehaviorRan = false;

@Injectable({ scope: Scope.REQUEST })
class App1Behavior implements IPipelineBehavior {
  async handle(
    _context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    app1BehaviorRan = true;
    return next();
  }
}

@Injectable({ scope: Scope.REQUEST })
class App2Behavior implements IPipelineBehavior {
  async handle(
    _context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    app2BehaviorRan = true;
    return next();
  }
}

@CommandHandler(LifecycleCommand)
@UsePipeline(App1Behavior)
class App1Handler implements ICommandHandler<LifecycleCommand> {
  async execute(command: LifecycleCommand): Promise<string> {
    return `app1:${command.value}`;
  }
}

@CommandHandler(LifecycleCommand)
@UsePipeline(App2Behavior)
class App2Handler implements ICommandHandler<LifecycleCommand> {
  async execute(command: LifecycleCommand): Promise<string> {
    return `app2:${command.value}`;
  }
}

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({ behaviors: [App1Behavior] }),
  ],
  providers: [App1Handler, App1Behavior],
})
class App1Module {}

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({ behaviors: [App2Behavior] }),
  ],
  providers: [App2Handler, App2Behavior],
})
class App2Module {}

async function run() {
  const app1 = await NestFactory.createApplicationContext(App1Module, {
    logger: false,
  });
  const app2 = await NestFactory.createApplicationContext(App2Module, {
    logger: false,
  });

  try {
    app1BehaviorRan = false;
    app2BehaviorRan = false;
    const res1 = await app1
      .get(CommandBus)
      .execute(new LifecycleCommand('alpha'));
    if (res1 !== 'app1:alpha' || !app1BehaviorRan || app2BehaviorRan) {
      throw new Error(
        `App 1 execution failed or leaked across contexts: res=${res1}, app1=${app1BehaviorRan}, app2=${app2BehaviorRan}`,
      );
    }

    app1BehaviorRan = false;
    app2BehaviorRan = false;
    const res2 = await app2
      .get(CommandBus)
      .execute(new LifecycleCommand('beta'));
    if (res2 !== 'app2:beta' || app1BehaviorRan || !app2BehaviorRan) {
      throw new Error(
        `App 2 execution failed or leaked across contexts: res=${res2}, app1=${app1BehaviorRan}, app2=${app2BehaviorRan}`,
      );
    }

    // Destroy App 1
    await app1.close();

    // App 2 should still work after App 1 is destroyed
    app1BehaviorRan = false;
    app2BehaviorRan = false;
    const res3 = await app2
      .get(CommandBus)
      .execute(new LifecycleCommand('gamma'));
    if (res3 !== 'app2:gamma' || app1BehaviorRan || !app2BehaviorRan) {
      throw new Error(
        `App 2 execution failed after App 1 close: res=${res3}, app1=${app1BehaviorRan}, app2=${app2BehaviorRan}`,
      );
    }
  } finally {
    await app2.close();
  }
}

run().catch((err) => {
  console.error(err);
  throw err;
});
