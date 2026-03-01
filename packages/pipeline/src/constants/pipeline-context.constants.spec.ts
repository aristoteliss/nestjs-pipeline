import { describe, it, expect } from 'vitest';
import { pipelineStore, SET_RESPONSE, SET_ORIGINAL_CORRELATION_ID } from '../constants/pipeline-context.constants';
import { IPipelineContext } from '../interfaces/pipeline.context.interface';

describe('pipelineStore', () => {
  it('returns undefined outside of a run()', () => {
    expect(pipelineStore.getStore()).toBeUndefined();
  });

  it('stores and retrieves a context inside run()', () => {
    const fakeCtx = { correlationId: 'ctx-1' } as IPipelineContext;
    pipelineStore.run(fakeCtx, () => {
      expect(pipelineStore.getStore()).toBe(fakeCtx);
    });
  });

  it('supports nested runs (inner overrides outer)', () => {
    const outer = { correlationId: 'outer' } as IPipelineContext;
    const inner = { correlationId: 'inner' } as IPipelineContext;

    pipelineStore.run(outer, () => {
      expect(pipelineStore.getStore()).toBe(outer);

      pipelineStore.run(inner, () => {
        expect(pipelineStore.getStore()).toBe(inner);
      });

      expect(pipelineStore.getStore()).toBe(outer);
    });
  });
});

describe('symbol keys', () => {
  it('SET_RESPONSE is a unique symbol', () => {
    expect(typeof SET_RESPONSE).toBe('symbol');
    expect(SET_RESPONSE.toString()).toContain('setResponse');
  });

  it('SET_ORIGINAL_CORRELATION_ID is a unique symbol', () => {
    expect(typeof SET_ORIGINAL_CORRELATION_ID).toBe('symbol');
    expect(SET_ORIGINAL_CORRELATION_ID.toString()).toContain('setOriginalCorrelationId');
  });
});
