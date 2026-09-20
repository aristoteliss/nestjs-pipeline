import 'reflect-metadata';
import { Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  CqrsModule,
  type IQueryHandler,
  QueryBus,
  QueryHandler,
} from '@nestjs/cqrs';
import {
  type CaslAuthorizationInput,
  CaslAuthorizer,
  CaslBehavior,
  CaslModule,
  getCaslPrincipal,
  type ICaslPermissionSource,
  requires,
  UnauthorizedActionException,
} from '@nestjs-pipeline/casl';
import {
  type IPipelineContext,
  PipelineModule,
  UsePipeline,
} from '@nestjs-pipeline/core';

class ReadDocQuery {
  constructor(readonly callerId: string) {}
}

@Injectable()
class GrantDirectory {
  rulesFor(id: string): string[] | undefined {
    return { reader: ['Doc|read|*'], writer: ['Doc|update|*'] }[id];
  }
}

@Injectable()
class FakeSource implements ICaslPermissionSource {
  constructor(private readonly directory: GrantDirectory) {}

  async load(
    context: IPipelineContext,
  ): Promise<CaslAuthorizationInput | null> {
    const { callerId } = context.request as ReadDocQuery;
    const rules = this.directory.rulesFor(callerId);
    return rules
      ? {
          principal: { id: callerId },
          rules: rules.map((rule) => {
            const [subject, action] = rule.split('|');
            return { subject, action };
          }),
        }
      : null;
  }
}

@Module({
  providers: [GrantDirectory, FakeSource],
  exports: [FakeSource],
})
class SourceModule {}

@QueryHandler(ReadDocQuery)
@UsePipeline(requires({ action: 'read', subject: 'Doc' }))
class ReadDocHandler implements IQueryHandler<ReadDocQuery> {
  constructor(private readonly authorizer: CaslAuthorizer) {}

  async execute(): Promise<string> {
    this.authorizer.authorize('read', 'Doc');
    return `doc for ${getCaslPrincipal()?.id}`;
  }
}

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({}),
    CaslModule.forRoot({
      imports: [SourceModule],
      permissionSource: { useExisting: FakeSource },
    }),
  ],
  providers: [ReadDocHandler],
})
class AppModule {}

async function expectDenied(promise: Promise<unknown>, label: string) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof UnauthorizedActionException) return;
    throw error;
  }
  throw new Error(`${label} was not denied`);
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    if (!(app.get(CaslBehavior) instanceof CaslBehavior)) {
      throw new Error('CaslBehavior did not resolve');
    }
    const bus = app.get(QueryBus);

    const allowed = await bus.execute(new ReadDocQuery('reader'));
    if (allowed !== 'doc for reader') {
      throw new Error(`Unexpected allowed result: ${String(allowed)}`);
    }
    await expectDenied(bus.execute(new ReadDocQuery('writer')), 'writer');
    await expectDenied(bus.execute(new ReadDocQuery('stranger')), 'stranger');
  } finally {
    await app.close();
  }
  console.log('CASL bootstrap contract passed');
}

run().catch((err) => {
  console.error(err);
  throw err;
});
