/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  pipelineStore,
  UsePipeline,
} from '@cqrs-ddd/pipeline';
import {
  correlationSource,
  getCorrelationId,
  runWithCorrelationId,
} from '@cqrs-ddd/pipeline-correlation';
import {
  currentTenantId,
  runWithTenant,
  tenantSource,
} from '@cqrs-ddd/pipeline-tenant';
import { Injectable } from '@nestjs/common';
import { CommandBus, CommandHandler, CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PipelineModule } from '../src/common/pipeline/pipeline.module.js';

@Injectable()
class PassBehavior implements IPipelineBehavior {
  handle(_context: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

interface Seen {
  context: { tenantId?: string; correlationId?: string };
  tenant?: string;
  correlation: string;
}

function seen(): Seen {
  const context = pipelineStore.getStore();
  return {
    context: {
      tenantId: context?.tenantId,
      correlationId: context?.correlationId,
    },
    tenant: currentTenantId(),
    correlation: getCorrelationId(),
  };
}

class InnerCommand {}
class OuterCommand {
  constructor(readonly innerTenant?: string) {}
}

@CommandHandler(InnerCommand)
@UsePipeline(PassBehavior)
class InnerHandler {
  async execute() {
    return seen();
  }
}

@CommandHandler(OuterCommand)
@UsePipeline(PassBehavior)
class OuterHandler {
  constructor(private readonly commands: CommandBus) {}

  async execute({ innerTenant }: OuterCommand) {
    const dispatch = () =>
      this.commands.execute<InnerCommand, Seen>(new InnerCommand());
    return {
      outer: seen(),
      inner: await (innerTenant
        ? runWithTenant(innerTenant, dispatch)
        : dispatch()),
    };
  }
}

describe('pipeline context from the tenant and correlation sources', () => {
  let commands: CommandBus;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        CqrsModule.forRoot(),
        PipelineModule.forRoot({
          sources: { tenantId: tenantSource, correlationId: correlationSource },
        }),
      ],
      providers: [InnerHandler, OuterHandler, PassBehavior],
    }).compile();
    const app = await module.createNestApplication().init();
    commands = app.get(CommandBus);
    close = () => app.close();
  });

  afterAll(() => close?.());

  const run = (command: OuterCommand) =>
    commands.execute<OuterCommand, { outer: Seen; inner: Seen }>(command);

  it('takes the tenant and correlation id where work entered, and nested commands inherit both', async () => {
    const { outer, inner } = await runWithTenant('tenant_a', () =>
      runWithCorrelationId('corr-1', () => run(new OuterCommand())),
    );

    const expected = {
      context: { tenantId: 'tenant_a', correlationId: 'corr-1' },
      tenant: 'tenant_a',
      correlation: 'corr-1',
    };
    expect(outer).toEqual(expected);
    expect(inner).toEqual(expected);
  });

  it('shows a generated correlation id to getCorrelationId() and to nested commands', async () => {
    const { outer, inner } = await runWithTenant('tenant_a', () =>
      run(new OuterCommand()),
    );

    expect(outer.correlation).toBe(outer.context.correlationId);
    expect(inner.context.correlationId).toBe(outer.context.correlationId);
  });

  it('gives a nested command dispatched under another tenant that tenant', async () => {
    const { inner } = await runWithTenant('tenant_a', () =>
      run(new OuterCommand('tenant_b')),
    );

    expect(inner.context.tenantId).toBe('tenant_b');
    expect(inner.tenant).toBe('tenant_b');
  });
});
