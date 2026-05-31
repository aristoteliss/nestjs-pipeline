/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { describe, expect, it } from 'vitest';
import {
  pipelineStore,
  SET_ORIGINAL_CORRELATION_ID,
  SET_RESPONSE,
} from '../constants/pipeline-context.constants';
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
    expect(SET_ORIGINAL_CORRELATION_ID.toString()).toContain(
      'setOriginalCorrelationId',
    );
  });
});
