import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { TraceBehavior } from './trace.behavior';

function context(): IPipelineContext {
  return {
    correlationId: 'real-api-correlation',
    originalCorrelationId: 'real-api-correlation',
    request: { id: '1' },
    requestType: class RealApiQuery {},
    requestName: 'RealApiQuery',
    handlerType: class RealApiHandler {},
    handlerName: 'RealApiHandler',
    requestKind: 'query',
    startedAt: new Date(),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: () => undefined,
  } as unknown as IPipelineContext;
}

/**
 * Integration contract against the real @opentelemetry/api global state.
 * No SDK/provider is installed by this spec; the API's default no-op tracer must
 * still allow normal handler execution without private readiness inspection.
 */
describe('TraceBehavior with real OpenTelemetry API and no SDK', () => {
  it('executes successfully through the API-provided no-op tracer', async () => {
    const behavior = new TraceBehavior();

    await expect(
      behavior.handle(context(), async () => ({ ok: true })),
    ).resolves.toEqual({ ok: true });
  });

  it('preserves handler errors when the global tracer is a no-op', async () => {
    const behavior = new TraceBehavior();
    const failure = new Error('real-api failure');

    await expect(
      behavior.handle(context(), async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });
});
