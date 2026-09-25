/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { toPostgresJson } from './postgres-json';

const roundTrip = (value: unknown) =>
  JSON.parse(toPostgresJson(JSON.stringify(value)));

describe('toPostgresJson', () => {
  it('replaces a NUL character with U+FFFD', () => {
    expect(roundTrip({ note: 'a\u0000b' })).toEqual({ note: 'a\ufffdb' });
  });

  it('replaces lone high and low surrogates with U+FFFD', () => {
    expect(roundTrip(['x\ud800y', 'x\udfffy', '\udbff'])).toEqual([
      'x\ufffdy',
      'x\ufffdy',
      '\ufffd',
    ]);
  });

  it('replaces them in object keys too', () => {
    expect(roundTrip({ 'k\u0000': 1, '\udc00': 2 })).toEqual({
      'k\ufffd': 1,
      '\ufffd': 2,
    });
  });

  it('keeps valid surrogate pairs, raw or escaped', () => {
    expect(roundTrip({ emoji: '🚚' })).toEqual({ emoji: '🚚' });
    expect(toPostgresJson('"\\ud83d\\ude9a"')).toBe('"\\ud83d\\ude9a"');
    expect(toPostgresJson('"\\uD83D\\uDE9A"')).toBe('"\\uD83D\\uDE9A"');
  });

  it('does not mistake an escaped backslash followed by u0000 for a NUL escape', () => {
    const text = 'C:\\u0000\\data';

    expect(JSON.stringify(text)).toBe('"C:\\\\u0000\\\\data"');
    expect(roundTrip(text)).toBe(text);
    expect(roundTrip('\\\u0000')).toBe('\\\ufffd');
  });

  it('keeps every other escape and character unchanged', () => {
    const value = {
      text: 'Ελένη "quoted" \n\t\r\b\f \u0001 \u001f é 注文',
      nested: [{ n: 1.5, ok: true, none: null }],
    };
    const json = JSON.stringify(value);

    expect(toPostgresJson(json)).toBe(json);
  });

  it('replaces uppercase escapes the same way', () => {
    expect(toPostgresJson('"\\uD800"')).toBe('"\\ufffd"');
  });
});
