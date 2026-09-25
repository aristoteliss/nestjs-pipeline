/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Exact output for representative inputs. These strings are cache keys,
 * rate-limit buckets and idempotency fingerprints once they reach a store, so
 * any change here silently orphans every stored entry. Treat a failure as a
 * breaking change, not as a snapshot to update.
 */

import { describe, expect, it } from 'vitest';
import {
  ABSENT_SEGMENT,
  escapeKeySegment,
  joinKeySegments,
} from './key-segment';
import { stableStringify } from './stableStringify';

describe('stableStringify golden output', () => {
  it.each([
    [
      'nested objects with unsorted keys',
      { z: { b: [3, { y: 1, x: 2 }], a: null }, m: 'text', a: true },
      '{"a":true,"m":"text","z":{"a":null,"b":[3,{"x":2,"y":1}]}}',
    ],
    [
      'arrays keep their order, numbers use JSON form',
      [[2, 1], { b: 1, a: [] }, 's', 0, -1.5, 1e21],
      '[[2,1],{"a":[],"b":1},"s",0,-1.5,1e+21]',
    ],
    [
      'dates as ISO-8601 with milliseconds',
      { at: new Date('2026-09-25T08:00:00.123Z') },
      '{"at":"2026-09-25T08:00:00.123Z"}',
    ],
    [
      'toJSON output, itself sorted',
      {
        v: {
          toJSON() {
            return { k: 2, j: 1 };
          },
        },
      },
      '{"v":{"j":1,"k":2}}',
    ],
    [
      'unicode keys in UTF-16 code unit order',
      { ω: 1, Ä: 2, a: 3, Z: 4, 注: 5, '🚚': 6, '': 7 },
      '{"":7,"Z":4,"a":3,"Ä":2,"ω":1,"注":5,"🚚":6}',
    ],
    [
      'string escapes as JSON.stringify writes them',
      { s: 'quote" back\\ nl\n tab\t nul\u0000 é' },
      String.raw`{"s":"quote\" back\\ nl\n tab\t nul\u0000 é"}`,
    ],
  ])('%s', (_label, input, expected) => {
    expect(stableStringify(input)).toBe(expected);
  });
});

describe('joinKeySegments golden output', () => {
  it.each([
    [
      'plain segments',
      ['cache', 'v3', 'tenant-a', 'user'],
      'cache:v3:tenant-a:user',
    ],
    ['a colon inside a segment', ['a:b', 'c'], String.raw`a\:b:c`],
    [
      'backslashes inside segments',
      [String.raw`a\b`, 'c\\'],
      String.raw`a\\b:c\\`,
    ],
    [
      'backslash and colon together',
      [String.raw`\:`, '::', String.raw`\\`],
      String.raw`\\\::\:\::\\\\`,
    ],
    [
      'undefined and null as the absent marker',
      [undefined, null, 'x', ''],
      String.raw`\-:\-:x:`,
    ],
    [
      'a literal absent marker stays distinct from an absent segment',
      [String.raw`\-`, '-'],
      String.raw`\\-:-`,
    ],
  ])('%s', (_label, segments, expected) => {
    expect(joinKeySegments(segments)).toBe(expected);
  });

  it('escapes the backslash before the colon', () => {
    expect(escapeKeySegment(String.raw`a\:b`)).toBe(String.raw`a\\\:b`);
    expect(ABSENT_SEGMENT).toBe(String.raw`\-`);
  });
});
