/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getCorrelationId } from '@cqrs-ddd/pipeline-correlation';
import { describe, expect, it, vi } from 'vitest';
import { CorrelationMiddleware } from './correlation.js';

describe('CorrelationMiddleware', () => {
  it('runs the request with the correlation id of its header and echoes it', () => {
    const request = {
      headers: { 'x-correlation-id': 'corr-1' },
    } as unknown as IncomingMessage;
    const response = { setHeader: vi.fn() } as unknown as ServerResponse;
    let seen: string | undefined;

    new CorrelationMiddleware().use(request, response, () => {
      seen = getCorrelationId();
    });

    expect(seen).toBe('corr-1');
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      'corr-1',
    );
  });
});
