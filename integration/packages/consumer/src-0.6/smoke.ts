import 'reflect-metadata';
import { Injectable, Module } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import {
  CommandBus,
  CommandHandler,
  CqrsModule,
  type ICommandHandler,
} from '@nestjs/cqrs';
import {
  ErrorFilter,
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  PipelineModule,
  UsePipeline,
} from '@nestjs-pipeline/core';
import {
  CorrelationMiddleware,
  correlationSource,
  getCorrelationId,
} from '@nestjs-pipeline/correlation';
import {
  type IJobPrincipal,
  JobContextModule,
  type PrincipalReference,
  withJobContext,
} from '@nestjs-pipeline/job-context';

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

let tenant: string | undefined;
const tenantSource = {
  current: () => tenant,
  run<T>(tenantId: string | undefined, fn: () => T) {
    const previous = tenant;
    tenant = tenantId;
    try {
      return fn();
    } finally {
      tenant = previous;
    }
  },
};

@Injectable()
class SmokePrincipal implements IJobPrincipal {
  capture(): PrincipalReference {
    return { id: 'u-1', type: 'user' };
  }

  restore<T>(_principal: PrincipalReference, work: () => Promise<T>) {
    return work();
  }
}

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot(),
    JobContextModule.forRoot({
      principal: SmokePrincipal,
      tenants: ['t-1'],
      sources: { tenantId: tenantSource, correlationId: correlationSource },
    }),
  ],
  providers: [
    MarkerBehavior,
    SmokeHandler,
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
class SmokeModule {}

function correlate(id: string) {
  const headers = new Map<string, unknown>();
  type Use = CorrelationMiddleware['use'];
  const request = {
    headers: { 'x-correlation-id': id },
  } as unknown as Parameters<Use>[0];
  const response = {
    setHeader: (name: string, value: unknown) => headers.set(name, value),
  } as unknown as Parameters<Use>[1];
  let seen: string | undefined;
  new CorrelationMiddleware().use(request, response, () => {
    seen = getCorrelationId();
  });
  return { seen, header: headers.get('x-correlation-id') };
}

async function main() {
  const app = await NestFactory.createApplicationContext(SmokeModule, {
    logger: false,
  });
  const result = await app.get(CommandBus).execute(new SmokeCommand('packed'));
  const job = tenantSource.run('t-1', () => withJobContext({ id: 'job-1' }));
  await app.close();
  if (result !== 'behavior:packed') {
    throw new Error(
      `Expected the packed core to run the pipeline, got ${result}`,
    );
  }
  if (
    job.jobContext.tenantId !== 't-1' ||
    job.jobContext.principal.id !== 'u-1'
  ) {
    throw new Error(
      `Expected the job to carry its context, got ${JSON.stringify(job)}`,
    );
  }

  const { seen, header } = correlate('c-1');
  if (seen !== 'c-1' || header !== 'c-1') {
    throw new Error(`Expected correlation id c-1, got ${seen} and ${header}`);
  }

  console.log('packed @nestjs-pipeline 0.6 smoke passed');
}

main().catch((error: unknown) => {
  console.error(error);
  throw error;
});
