/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { Server } from 'node:http';
import {
  Controller,
  Get,
  type INestApplication,
  Injectable,
  Module,
} from '@nestjs/common';
import { CommandBus, CommandHandler, CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  PipelineModule,
  type PipelineModuleFeatureOptions,
  UsePipeline,
} from '@nestjs-pipeline/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

@Injectable()
class FeatureDependency {
  calls: string[] = [];

  record(action: string) {
    this.calls.push(action);
  }
}

@Module({ providers: [FeatureDependency], exports: [FeatureDependency] })
class FeatureDependenciesModule {}

@Injectable()
class ImportedBehavior implements IPipelineBehavior {
  constructor(private readonly dependency: FeatureDependency) {}

  async handle(context: IPipelineContext, next: NextDelegate) {
    const options = context.getBehaviorOptions<{ action: string }>(
      ImportedBehavior,
    );
    this.dependency.record(options?.action ?? 'missing-options');
    return next();
  }
}

@Injectable()
class LegacyBehavior implements IPipelineBehavior {
  calls = 0;

  async handle(_context: IPipelineContext, next: NextDelegate) {
    this.calls++;
    return next();
  }
}

class DecoratedCommand {}
class PlainCommand {}

@CommandHandler(DecoratedCommand)
@UsePipeline([ImportedBehavior, { action: 'feature.run' }], LegacyBehavior)
class DecoratedHandler {
  async execute() {
    return { result: 'decorated' };
  }
}

@CommandHandler(PlainCommand)
class PlainHandler {
  async execute() {
    return { result: 'plain' };
  }
}

@Controller('feature')
class FeatureController {
  constructor(private readonly commands: CommandBus) {}

  @Get('decorated')
  decorated() {
    return this.commands.execute(new DecoratedCommand());
  }

  @Get('plain')
  plain() {
    return this.commands.execute(new PlainCommand());
  }
}

const featureOptions: PipelineModuleFeatureOptions = {
  imports: [FeatureDependenciesModule],
  behaviors: [ImportedBehavior],
};

@Module({
  imports: [
    PipelineModule.forFeature(featureOptions),
    PipelineModule.forFeature([LegacyBehavior]),
  ],
})
class BehaviorRegistrationModule {}

// Handlers deliberately live outside the module registering the behaviors.
@Module({
  imports: [CqrsModule],
  controllers: [FeatureController],
  providers: [DecoratedHandler, PlainHandler],
})
class ConsumerModule {}

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({ bootstrapLogLevel: 'none' }),
    BehaviorRegistrationModule,
    ConsumerModule,
  ],
})
class TestAppModule {}

describe('PipelineModule.forFeature (e2e)', () => {
  let app: INestApplication;
  let http: Server;
  let dependency: FeatureDependency;
  let legacy: LegacyBehavior;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    http = app.getHttpServer() as Server;
    dependency = app.get(FeatureDependency);
    legacy = app.get(LegacyBehavior);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('injects imported dependencies and runs both registration forms across modules exactly once', async () => {
    dependency.calls.length = 0;
    legacy.calls = 0;

    await request(http)
      .get('/feature/decorated')
      .expect(200, { result: 'decorated' });

    expect(dependency.calls).toEqual(['feature.run']);
    expect(legacy.calls).toBe(1);
  });

  it('does not apply registered behaviors to undecorated handlers', async () => {
    dependency.calls.length = 0;
    legacy.calls = 0;

    await request(http).get('/feature/plain').expect(200, { result: 'plain' });

    expect(dependency.calls).toEqual([]);
    expect(legacy.calls).toBe(0);
  });
});
