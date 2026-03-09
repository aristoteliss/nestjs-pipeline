import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { WithCorrelation, CorrelationFrom } from './with-correlation.decorator';
import { getCorrelationId, correlationStore } from '../correlation.store';
import { Logger } from '@nestjs/common';

// ── Helpers ─────────────────────────────────────────────────

function fakeJob(data: Record<string, any> = {}) {
  return { data } as any;
}

function fakeRmqContext(correlationId?: string) {
  return {
    getMessage: () => ({
      properties: { correlationId },
    }),
  };
}

function fakeKafkaContext(headers?: Record<string, Buffer | string>) {
  return {
    getMessage: () => ({ headers }),
  };
}

// ── Default path (data.correlationId) ───────────────────────

describe('WithCorrelation — default path', () => {
  it('sets the correlation store from job.data.correlationId', async () => {
    let captured: string | undefined;

    class Processor {
      @WithCorrelation()
      async handle(job: any) {
        captured = getCorrelationId();
        return 'done';
      }
    }

    const p = new Processor();
    const result = await p.handle(fakeJob({ correlationId: 'abc-123' }));

    expect(captured).toBe('abc-123');
    expect(result).toBe('done');
  });

  it('generates uuidv7 when correlationId is missing from job.data', async () => {
    let captured: string | undefined;

    class Processor {
      @WithCorrelation()
      async handle(job: any) {
        captured = getCorrelationId();
      }
    }

    const p = new Processor();
    await p.handle(fakeJob({}));

    // runCorrelationId falls back to uuidv7
    expect(captured).toBeDefined();
    expect(captured).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('does not leak correlation ID outside the method', async () => {
    class Processor {
      @WithCorrelation()
      async handle(job: any) {
        return getCorrelationId();
      }
    }

    const p = new Processor();
    await p.handle(fakeJob({ correlationId: 'scoped' }));

    // Outside the decorated method, the scoped ID must not persist.
    // getCorrelationId() returns a fresh uuidv7 when no context is active.
    expect(getCorrelationId()).not.toBe('scoped');
  });

  it('inherits parent context when no ID is extracted', async () => {
    let captured: string | undefined;

    class Processor {
      @WithCorrelation()
      async handle(job: any) {
        captured = getCorrelationId();
      }
    }

    const p = new Processor();

    // Simulate: already inside a parent correlation context (e.g. saga)
    await correlationStore.run('parent-id', async () => {
      await p.handle(fakeJob({})); // no correlationId in data
    });

    // runCorrelationId falls back to parent store
    expect(captured).toBe('parent-id');
  });
});

// ── Custom path ─────────────────────────────────────────────

describe('WithCorrelation — custom path', () => {
  it('supports string shorthand', async () => {
    let captured: string | undefined;

    class Processor {
      @WithCorrelation('data.x-request-id')
      async handle(job: any) {
        captured = getCorrelationId();
      }
    }

    const p = new Processor();
    await p.handle(fakeJob({ 'x-request-id': 'custom-456' }));

    expect(captured).toBe('custom-456');
  });

  it('supports path in options object', async () => {
    let captured: string | undefined;

    class Processor {
      @WithCorrelation({ path: 'data.traceId' })
      async handle(job: any) {
        captured = getCorrelationId();
      }
    }

    const p = new Processor();
    await p.handle(fakeJob({ traceId: 'trace-789' }));

    expect(captured).toBe('trace-789');
  });

  it('handles deeply nested path', async () => {
    let captured: string | undefined;

    class Processor {
      @WithCorrelation({ path: 'metadata.tracing.correlationId' })
      async handle(msg: any) {
        captured = getCorrelationId();
      }
    }

    const p = new Processor();
    await p.handle({
      metadata: { tracing: { correlationId: 'deep-nested' } },
    });

    expect(captured).toBe('deep-nested');
  });
});

// ── Custom extractor ────────────────────────────────────────

describe('WithCorrelation — custom extract', () => {
  it('extracts from RabbitMQ context (second argument)', async () => {
    let captured: string | undefined;

    class Handler {
      @WithCorrelation({
        extract: (_data: any, ctx: any) =>
          ctx.getMessage().properties.correlationId,
      })
      async handle(data: any, ctx: any) {
        captured = getCorrelationId();
      }
    }

    const h = new Handler();
    await h.handle({ userId: '1' }, fakeRmqContext('rmq-abc'));

    expect(captured).toBe('rmq-abc');
  });

  it('extracts from Kafka context headers', async () => {
    let captured: string | undefined;

    class Handler {
      @WithCorrelation({
        extract: (_data: any, ctx: any) => {
          const headers = ctx.getMessage().headers;
          return headers?.['x-correlation-id']?.toString();
        },
      })
      async handle(data: any, ctx: any) {
        captured = getCorrelationId();
      }
    }

    const h = new Handler();
    await h.handle(
      { orderId: '42' },
      fakeKafkaContext({ 'x-correlation-id': 'kafka-xyz' }),
    );

    expect(captured).toBe('kafka-xyz');
  });

  it('extract takes precedence over path', async () => {
    let captured: string | undefined;

    class Processor {
      @WithCorrelation({
        path: 'data.correlationId',
        extract: () => 'from-extract',
      })
      async handle(job: any) {
        captured = getCorrelationId();
      }
    }

    const p = new Processor();
    await p.handle(fakeJob({ correlationId: 'from-path' }));

    expect(captured).toBe('from-extract');
  });

  it('falls back to uuidv7 when extractor returns undefined', async () => {
    let captured: string | undefined;

    class Handler {
      @WithCorrelation({ extract: () => undefined })
      async handle() {
        captured = getCorrelationId();
      }
    }

    const h = new Handler();
    await h.handle();

    expect(captured).toBeDefined();
    expect(captured).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

// ── Return value & errors ───────────────────────────────────

describe('WithCorrelation — return value & errors', () => {
  it('preserves async return value', async () => {
    class Processor {
      @WithCorrelation()
      async handle(_job: any) {
        return { success: true, count: 42 };
      }
    }

    const p = new Processor();
    const result = await p.handle(fakeJob({ correlationId: 'id' }));
    expect(result).toEqual({ success: true, count: 42 });
  });

  it('preserves synchronous return value', () => {
    class Processor {
      @WithCorrelation()
      handle(_job: any) {
        return 'sync';
      }
    }

    const p = new Processor();
    expect(p.handle(fakeJob({ correlationId: 'id' }))).toBe('sync');
  });

  it('propagates async errors', async () => {
    class Processor {
      @WithCorrelation()
      async handle(_job: any) {
        throw new Error('boom');
      }
    }

    const p = new Processor();
    await expect(
      p.handle(fakeJob({ correlationId: 'id' })),
    ).rejects.toThrow('boom');
  });

  it('propagates synchronous errors', () => {
    class Processor {
      @WithCorrelation()
      handle(_job: any) {
        throw new Error('sync-boom');
      }
    }

    const p = new Processor();
    expect(() => p.handle(fakeJob({ correlationId: 'id' }))).toThrow(
      'sync-boom',
    );
  });
});

// ── this context & function name ────────────────────────────

describe('WithCorrelation — this context & meta', () => {
  it('preserves class instance (this)', async () => {
    class Processor {
      readonly tag = 'my-processor';

      @WithCorrelation()
      async handle(_job: any) {
        return this.tag;
      }
    }

    const p = new Processor();
    expect(await p.handle(fakeJob({ correlationId: 'id' }))).toBe(
      'my-processor',
    );
  });

  it('preserves original function name', () => {
    class Processor {
      @WithCorrelation()
      async handleSendEmail(_job: any) {}
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      Processor.prototype,
      'handleSendEmail',
    )!;
    expect(descriptor.value.name).toBe('handleSendEmail');
  });
});

// ── Edge cases ──────────────────────────────────────────────

describe('WithCorrelation — edge cases', () => {
  it('warns when first argument is an array and dot-path is used', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    class Processor {
      @WithCorrelation()
      async handle(_job: any) {
        return getCorrelationId();
      }
    }

    const p = new Processor();
    await p.handle([{ correlationId: 'in-array' }] as any);

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('first argument is an array'),
    );

    warnSpy.mockRestore();
  });

  it('does not warn for array when custom extract is provided', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    class Processor {
      @WithCorrelation({ extract: (data: any) => data?.[0]?.correlationId })
      async handle(_job: any) {
        return getCorrelationId();
      }
    }

    const p = new Processor();
    await p.handle([{ correlationId: 'arr-extract' }] as any);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('handles undefined first argument (generates uuidv7)', async () => {
    let captured: string | undefined;

    class Processor {
      @WithCorrelation()
      async handle(_job: any) {
        captured = getCorrelationId();
      }
    }

    const p = new Processor();
    await p.handle(undefined as any);

    expect(captured).toBeDefined();
    expect(captured).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('handles null data in first argument', async () => {
    let captured: string | undefined;

    class Processor {
      @WithCorrelation()
      async handle(_job: any) {
        captured = getCorrelationId();
      }
    }

    const p = new Processor();
    await p.handle({ data: null } as any);

    expect(captured).toBeDefined();
  });

  it('does not interfere with other decorator metadata', () => {
    const PROCESS_META = 'bull:module_queue_process';
    function FakeProcess(name: string): MethodDecorator {
      return (_target, _key, desc) => {
        Reflect.defineMetadata(PROCESS_META, { name }, desc.value!);
        return desc;
      };
    }

    class Processor {
      @FakeProcess('send-email')
      @WithCorrelation()
      async handle(_job: any) {}
    }

    const instance = new Processor();
    const meta = Reflect.getMetadata(PROCESS_META, instance.handle);
    expect(meta).toEqual({ name: 'send-email' });
  });

  it('inner decorator wins over outer correlation context', async () => {
    let captured: string | undefined;

    class Processor {
      @WithCorrelation()
      async handle(job: any) {
        captured = getCorrelationId();
      }
    }

    const p = new Processor();

    await correlationStore.run('outer-id', async () => {
      await p.handle(fakeJob({ correlationId: 'inner-id' }));
    });

    expect(captured).toBe('inner-id');
  });
});

// ── Cron job ────────────────────────────────────────────────

describe('WithCorrelation — cron job', () => {
  it('generates uuidv7 for methods with no arguments', async () => {
    let captured: string | undefined;

    class Scheduler {
      @WithCorrelation()
      async hourlySync() {
        captured = getCorrelationId();
      }
    }

    const s = new Scheduler();
    await s.hourlySync();

    expect(captured).toBeDefined();
    expect(captured).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

// ── CorrelationFrom presets ─────────────────────────────────

describe('CorrelationFrom.amqp', () => {
  it('extracts correlationId from AMQP message properties', async () => {
    let captured: string | undefined;

    class Handler {
      @WithCorrelation(CorrelationFrom.amqp())
      async handle(_data: any, _ctx: any) {
        captured = getCorrelationId();
      }
    }

    const h = new Handler();
    await h.handle({ userId: '1' }, fakeRmqContext('amqp-corr-123'));
    expect(captured).toBe('amqp-corr-123');
  });

  it('falls back to uuidv7 when properties.correlationId is missing', async () => {
    let captured: string | undefined;

    class Handler {
      @WithCorrelation(CorrelationFrom.amqp())
      async handle(_data: any, _ctx: any) {
        captured = getCorrelationId();
      }
    }

    const h = new Handler();
    await h.handle({}, { getMessage: () => ({ properties: {} }) });
    expect(captured).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('CorrelationFrom.kafka', () => {
  it('extracts correlationId from Kafka message headers (Buffer)', async () => {
    let captured: string | undefined;

    class Handler {
      @WithCorrelation(CorrelationFrom.kafka())
      async handle(_data: any, _ctx: any) {
        captured = getCorrelationId();
      }
    }

    const h = new Handler();
    await h.handle({}, fakeKafkaContext({ 'x-correlation-id': Buffer.from('kafka-123') }));
    expect(captured).toBe('kafka-123');
  });

  it('extracts correlationId from Kafka message headers (string)', async () => {
    let captured: string | undefined;

    class Handler {
      @WithCorrelation(CorrelationFrom.kafka())
      async handle(_data: any, _ctx: any) {
        captured = getCorrelationId();
      }
    }

    const h = new Handler();
    await h.handle({}, fakeKafkaContext({ 'x-correlation-id': 'kafka-str' }));
    expect(captured).toBe('kafka-str');
  });

  it('supports custom header key', async () => {
    let captured: string | undefined;

    class Handler {
      @WithCorrelation(CorrelationFrom.kafka('x-request-id'))
      async handle(_data: any, _ctx: any) {
        captured = getCorrelationId();
      }
    }

    const h = new Handler();
    await h.handle({}, fakeKafkaContext({ 'x-request-id': 'custom-kafka' }));
    expect(captured).toBe('custom-kafka');
  });
});

describe('CorrelationFrom.nats', () => {
  it('extracts correlationId from NATS headers', async () => {
    let captured: string | undefined;

    class Handler {
      @WithCorrelation(CorrelationFrom.nats())
      async handle(_data: any, _ctx: any) {
        captured = getCorrelationId();
      }
    }

    const fakeNatsCtx = {
      getHeaders: () => ({
        get: (key: string) => key === 'x-correlation-id' ? 'nats-789' : undefined,
      }),
    };

    const h = new Handler();
    await h.handle({}, fakeNatsCtx);
    expect(captured).toBe('nats-789');
  });
});

describe('CorrelationFrom.grpc', () => {
  it('extracts correlationId from gRPC metadata', async () => {
    let captured: string | undefined;

    class Handler {
      @WithCorrelation(CorrelationFrom.grpc())
      async handle(_data: any, _metadata: any) {
        captured = getCorrelationId();
      }
    }

    const fakeMetadata = {
      get: (key: string) => key === 'x-correlation-id' ? ['grpc-456'] : [],
    };

    const h = new Handler();
    await h.handle({}, fakeMetadata);
    expect(captured).toBe('grpc-456');
  });
});

// ── logLevel option ─────────────────────────────────────────

describe('WithCorrelation — logLevel', () => {
  it('logs at the specified level with the resolved correlationId', async () => {
    const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});

    class Processor {
      @WithCorrelation({ logLevel: 'debug' })
      async handle(job: any) {
        return getCorrelationId();
      }
    }

    const p = new Processor();
    await p.handle(fakeJob({ correlationId: 'log-test-123' }));

    expect(debugSpy).toHaveBeenCalledOnce();
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('log-test-123'),
    );

    debugSpy.mockRestore();
  });

  it('logs the class and method name in the message', async () => {
    const verboseSpy = vi.spyOn(Logger.prototype, 'verbose').mockImplementation(() => {});

    class EmailProcessor {
      @WithCorrelation({ logLevel: 'verbose' })
      async handleSendEmail(job: any) {}
    }

    const p = new EmailProcessor();
    await p.handleSendEmail(fakeJob({ correlationId: 'id' }));

    expect(verboseSpy).toHaveBeenCalledWith(
      expect.stringContaining('EmailProcessor.handleSendEmail'),
    );

    verboseSpy.mockRestore();
  });

  it('logs at debug level when logLevel is omitted', async () => {
    const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});

    class Processor {
      @WithCorrelation()
      async handle(job: any) {}
    }

    const p = new Processor();
    await p.handle(fakeJob({ correlationId: 'default-level' }));

    expect(debugSpy).toHaveBeenCalledOnce();
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('default-level'),
    );

    debugSpy.mockRestore();
  });

  it('does not log when logLevel is "none"', async () => {
    const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    class Processor {
      @WithCorrelation({ logLevel: 'none' })
      async handle(job: any) {}
    }

    const p = new Processor();
    await p.handle(fakeJob({ correlationId: 'none-level' }));

    expect(debugSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();

    debugSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('logs the resolved uuidv7 when extracted ID is undefined', async () => {
    const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});

    class Processor {
      @WithCorrelation({ logLevel: 'debug' })
      async handle(job: any) {}
    }

    const p = new Processor();
    await p.handle(fakeJob({})); // no correlationId → fallback to uuidv7

    expect(debugSpy).toHaveBeenCalledOnce();
    // Should log the resolved uuidv7, not "undefined"
    expect(debugSpy).toHaveBeenCalledWith(
      expect.not.stringContaining('undefined'),
    );

    debugSpy.mockRestore();
  });

  it('routes to the correct Logger method for each level', async () => {
    const levels = ['log', 'debug', 'verbose', 'warn', 'error'] as const;

    for (const level of levels) {
      const spy = vi.spyOn(Logger.prototype, level).mockImplementation(() => {});

      class Processor {
        @WithCorrelation({ logLevel: level })
        async handle(job: any) {}
      }

      const p = new Processor();
      await p.handle(fakeJob({ correlationId: `id-${level}` }));

      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    }
  });
});
