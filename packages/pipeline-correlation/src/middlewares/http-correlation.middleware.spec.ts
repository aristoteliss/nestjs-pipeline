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

import { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { correlationStore } from '../correlation.store';
import { HttpCorrelationMiddleware } from './http-correlation.middleware';

function fakeRequest(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

const fakeResponse = {} as ServerResponse;

describe('HttpCorrelationMiddleware', () => {
  it('extracts x-correlation-id header by default', () => {
    const middleware = new HttpCorrelationMiddleware();
    const req = fakeRequest({ 'x-correlation-id': 'abc-123' });

    let captured: string | undefined;
    middleware.use(req, fakeResponse, () => {
      captured = correlationStore.getStore();
    });

    expect(captured).toBe('abc-123');
  });

  it('calls next without a store when header is missing', () => {
    const middleware = new HttpCorrelationMiddleware();
    const req = fakeRequest({});
    const next = vi.fn();

    middleware.use(req, fakeResponse, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('uses a custom header name from options', () => {
    const middleware = new HttpCorrelationMiddleware({
      header: 'x-request-id',
    });
    const req = fakeRequest({ 'x-request-id': 'custom-456' });

    let captured: string | undefined;
    middleware.use(req, fakeResponse, () => {
      captured = correlationStore.getStore();
    });

    expect(captured).toBe('custom-456');
  });

  it('defaults to x-correlation-id when options has no header field', () => {
    const middleware = new HttpCorrelationMiddleware({});
    const req = fakeRequest({ 'x-correlation-id': 'default-789' });

    let captured: string | undefined;
    middleware.use(req, fakeResponse, () => {
      captured = correlationStore.getStore();
    });

    expect(captured).toBe('default-789');
  });
});
