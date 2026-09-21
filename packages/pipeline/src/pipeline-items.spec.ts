/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  createPipelineItem,
  getPipelineItem,
  hasPipelineItem,
  MissingPipelineItemError,
  PipelineContext,
  requirePipelineItem,
  setPipelineItem,
} from './index';

class Request {}
class Handler {}

function context() {
  return new PipelineContext(new Request(), {
    handlerType: Handler,
    handlerName: 'Handler',
    requestKind: 'command',
  });
}

describe('typed pipeline items', () => {
  it('creates distinct symbol keys even for identical names', () => {
    const first = createPipelineItem<string>('principal');
    const second = createPipelineItem<string>('principal');
    expect(first.name).toBe('principal');
    expect(typeof first.key).toBe('symbol');
    expect(first.key).not.toBe(second.key);
    const ctx = context();
    setPipelineItem(ctx, first, 'alice');
    expect(getPipelineItem(ctx, second)).toBeUndefined();
  });

  it('infers reads and constrains writes to the token type', () => {
    const ctx = context();
    const token = createPipelineItem<{ id: string }>('principal');
    const value = { id: 'alice' };
    setPipelineItem(ctx, token, value);
    expect(getPipelineItem(ctx, token)).toBe(value);
    expect(requirePipelineItem(ctx, token)).toBe(value);
    expectTypeOf(getPipelineItem(ctx, token)).toEqualTypeOf<
      { id: string } | undefined
    >();
    expectTypeOf(requirePipelineItem(ctx, token)).toEqualTypeOf<{
      id: string;
    }>();
    expectTypeOf(getPipelineItem(ctx, 'raw')).toEqualTypeOf<unknown>();
    // @ts-expect-error The token requires a string ID.
    setPipelineItem(ctx, token, { id: 1 });
    const literal = createPipelineItem<'allowed'>('decision');
    // @ts-expect-error Values must not widen a token's declared type.
    setPipelineItem(ctx, literal, 'denied');
  });

  it.each(['legacy', Symbol('legacy')])(
    'preserves explicit key identity and raw interoperability for %s',
    (key) => {
      const ctx = context();
      const token = createPipelineItem<number>('legacyCount', key);
      expect(token.key).toBe(key);
      ctx.items.set(key, 1);
      expect(getPipelineItem(ctx, token)).toBe(1);
      setPipelineItem(ctx, token, 2);
      expect(ctx.items.get(key)).toBe(2);
      setPipelineItem(ctx, key, 3);
      expect(requirePipelineItem<number>(ctx, key)).toBe(3);
      expect(hasPipelineItem(ctx, key)).toBe(true);
      ctx.items.delete(key);
      expect(hasPipelineItem(ctx, token)).toBe(false);
    },
  );

  it.each([false, 0, '', null])('returns present falsy value %s', (value) => {
    const ctx = context();
    const token = createPipelineItem<typeof value>('value');
    setPipelineItem(ctx, token, value);
    expect(requirePipelineItem(ctx, token)).toBe(value);
  });

  it.each([false, true])(
    'rejects missing or undefined items with diagnostic context (stored: %s)',
    (stored) => {
      const ctx = context();
      const token = createPipelineItem<string>('principal');
      if (stored) ctx.items.set(token.key, undefined);
      expect(hasPipelineItem(ctx, token)).toBe(stored);
      expect(getPipelineItem(ctx, token)).toBeUndefined();
      expect(() => requirePipelineItem(ctx, token)).toThrow(
        MissingPipelineItemError,
      );
      try {
        requirePipelineItem(ctx, token, 'Run the identity behavior first.');
      } catch (error) {
        expect(error).toMatchObject({
          name: 'MissingPipelineItemError',
          itemName: 'principal',
          requestName: 'Request',
          handlerName: 'Handler',
        });
        expect((error as Error).message).toContain('principal');
        expect((error as Error).message).toContain('Request');
        expect((error as Error).message).toContain('Handler');
        expect((error as Error).message).toContain(
          'Run the identity behavior first.',
        );
      }
    },
  );

  it.each(['raw', Symbol('raw')])(
    'names missing raw keys in diagnostics for %s',
    (key) => {
      expect(() => requirePipelineItem(context(), key)).toThrow(
        `Missing pipeline item "${String(key)}"`,
      );
    },
  );
});
