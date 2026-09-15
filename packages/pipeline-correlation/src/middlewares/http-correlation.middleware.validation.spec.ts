/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { getCorrelationId } from '../correlation.store';
import { HttpCorrelationMiddleware } from './http-correlation.middleware';

function run(
  middleware: HttpCorrelationMiddleware,
  incoming?: string,
  header = 'x-correlation-id',
): { id: string; responseId: string; responseHeader: string } {
  const req = {
    headers: incoming !== undefined ? { [header]: incoming } : {},
  } as unknown as IncomingMessage;
  let responseId = '';
  let responseHeader = '';
  const res = {
    setHeader: vi.fn((name: string, value: string) => {
      responseHeader = name;
      responseId = value;
    }),
  } as unknown as ServerResponse;
  let id = '';

  middleware.use(req, res, () => {
    id = getCorrelationId();
  });

  return { id, responseId, responseHeader };
}

describe('HttpCorrelationMiddleware incoming ID compatibility and validation', () => {
  it('preserves the historical incoming value exactly by default', () => {
    expect(run(new HttpCorrelationMiddleware(), ' trace id / A ')).toEqual({
      id: ' trace id / A ',
      responseId: ' trace id / A ',
      responseHeader: 'x-correlation-id',
    });
  });

  it('keeps the historical empty-header fallback behavior', () => {
    const result = run(new HttpCorrelationMiddleware(), '');
    expect(result.id).not.toBe('');
    expect(result.responseId).toBe(result.id);
    expect(result.responseHeader).toBe('x-correlation-id');
  });

  it('keeps header=false mapped to the default header for compatibility', () => {
    const result = run(
      new HttpCorrelationMiddleware({ header: false } as never),
      'legacy-id',
    );
    expect(result).toEqual({
      id: 'legacy-id',
      responseId: 'legacy-id',
      responseHeader: 'x-correlation-id',
    });
  });

  it('keeps custom header lookup and lower-casing unchanged', () => {
    const result = run(
      new HttpCorrelationMiddleware({ header: 'X-Request-ID' } as never),
      'custom-id',
      'x-request-id',
    );
    expect(result).toEqual({
      id: 'custom-id',
      responseId: 'custom-id',
      responseHeader: 'x-request-id',
    });
  });

  it('can trim and bound incoming identifiers when explicitly configured', () => {
    const middleware = new HttpCorrelationMiddleware({
      trimIncoming: true,
      maxLength: 12,
    } as never);

    expect(run(middleware, ' trace-123 ')).toEqual({
      id: 'trace-123',
      responseId: 'trace-123',
      responseHeader: 'x-correlation-id',
    });

    const long = 'x'.repeat(13);
    expect(run(middleware, long).id).not.toBe(long);
  });

  it('can reject all caller supplied IDs', () => {
    const result = run(
      new HttpCorrelationMiddleware({ acceptIncoming: false } as never),
      'caller-id',
    );
    expect(result.id).not.toBe('caller-id');
    expect(result.responseId).toBe(result.id);
  });

  it('supports custom validation without requiring UUID format', () => {
    const middleware = new HttpCorrelationMiddleware({
      validateIncoming: (value: string) => value.startsWith('trusted:'),
    } as never);

    expect(run(middleware, 'trusted:abc').id).toBe('trusted:abc');
    expect(run(middleware, 'other:abc').id).not.toBe('other:abc');
  });

  it('falls back safely when a custom validator throws', () => {
    const middleware = new HttpCorrelationMiddleware({
      validateIncoming: () => {
        throw new Error('bad validator');
      },
    } as never);

    expect(run(middleware, 'caller-id').id).not.toBe('caller-id');
  });

  it('validates maxLength only when the option is configured', () => {
    expect(
      () => new HttpCorrelationMiddleware({ maxLength: 0 } as never),
    ).toThrow(/positive safe integer/);

    expect(() => new HttpCorrelationMiddleware()).not.toThrow();
  });
});
