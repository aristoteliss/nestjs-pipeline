/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DEAD_LETTER_DEFAULTS } from '@common/dead-letter/dead-letter.options.js';
import { ObservabilityModule } from '@common/modules/index.js';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import {
  DeadLetterBehavior,
  type DeadLetterRecord,
} from '@cqrs-ddd/pipeline-deadletter';
import {
  createFeatureFlagClient,
  FeatureFlagBehavior,
  featureFlag,
  releaseFeatureFlagProvider,
} from '@cqrs-ddd/pipeline-feature-flags';
import type { INestApplication } from '@nestjs/common';
import {
  CommandBus,
  CommandHandler,
  CqrsModule,
  type ICommandHandler,
} from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { trace } from '@opentelemetry/api';
import { tracing } from '@opentelemetry/sdk-node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

class ProbeCommand {
  constructor(readonly fail: boolean) {}
}

@CommandHandler(ProbeCommand)
@UsePipeline(featureFlag({ flag: 'probe' }))
class ProbeHandler implements ICommandHandler<ProbeCommand> {
  async execute({ fail }: ProbeCommand): Promise<string> {
    if (fail) throw new Error('processor failed');
    return 'done';
  }
}

const FEATURE_FLAGS = {
  provider: new TypedInMemoryProvider({
    probe: {
      disabled: false,
      variants: { on: true, off: false },
      defaultVariant: 'on',
    },
  }),
};

describe('ObservabilityModule span attributes', () => {
  const exporter = new tracing.InMemorySpanExporter();
  const records: DeadLetterRecord[] = [];
  let app: INestApplication;
  let bus: CommandBus;

  const probeSpan = () => {
    const spans = exporter
      .getFinishedSpans()
      .filter((span) => span.name === 'command.ProbeCommand');
    expect(spans).toHaveLength(1);
    return spans[0].attributes;
  };

  beforeAll(async () => {
    trace.setGlobalTracerProvider(
      new tracing.BasicTracerProvider({
        spanProcessors: [new tracing.SimpleSpanProcessor(exporter)],
      }),
    );
    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule.forRoot(), ObservabilityModule],
      providers: [
        ProbeHandler,
        {
          provide: DeadLetterBehavior,
          useValue: new DeadLetterBehavior(
            {
              send: async (record: DeadLetterRecord) => {
                records.push(record);
              },
            },
            DEAD_LETTER_DEFAULTS,
          ),
        },
        {
          provide: FeatureFlagBehavior,
          useFactory: async () =>
            new FeatureFlagBehavior(
              await createFeatureFlagClient(FEATURE_FLAGS),
            ),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    bus = app.get(CommandBus);
  });

  afterAll(async () => {
    await app.close();
    await releaseFeatureFlagProvider(FEATURE_FLAGS);
    trace.disable();
  });

  beforeEach(() => {
    exporter.reset();
    records.length = 0;
  });

  it('records the decisions of the behaviors that ran, and none for those that did not', async () => {
    await expect(bus.execute(new ProbeCommand(false))).resolves.toBe('done');

    const attributes = probeSpan();
    expect(attributes).toMatchObject({
      'feature_flag.key': 'probe',
      'feature_flag.enabled': true,
      'feature_flag.variant': 'on',
    });
    expect(attributes).not.toHaveProperty('cache.hit');
    expect(attributes).not.toHaveProperty('idempotency.replayed');
    expect(attributes).not.toHaveProperty('dead_letter.captured');
  });

  it('records a dead-letter capture on the span of the failed command', async () => {
    await expect(bus.execute(new ProbeCommand(true))).rejects.toThrow(
      'processor failed',
    );

    expect(records).toHaveLength(1);
    expect(probeSpan()).toMatchObject({
      'dead_letter.captured': true,
      'pipeline.outcome': 'failure',
    });
  });
});
