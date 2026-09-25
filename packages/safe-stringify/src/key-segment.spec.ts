/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import {
  ABSENT_SEGMENT,
  escapeKeySegment,
  joinKeySegments,
} from './key-segment';

describe('escapeKeySegment', () => {
  it('leaves ordinary identifiers untouched', () => {
    expect(escapeKeySegment('user-123')).toBe('user-123');
  });

  it('escapes the separator and the escape character itself', () => {
    expect(escapeKeySegment('a:b')).toBe('a\\:b');
    expect(escapeKeySegment('a\\b')).toBe('a\\\\b');
  });

  it('escapes the backslash first so a separator cannot be forged', () => {
    // Without backslash-first ordering, the input "a\" followed by a segment
    // starting with ":" would produce "a\:" — an escaped separator — and merge
    // two segments into one.
    expect(escapeKeySegment('a\\')).toBe('a\\\\');
    expect(joinKeySegments(['a\\', ':b'])).toBe('a\\\\:\\:b');
  });
});

describe('joinKeySegments', () => {
  it('keeps tuples that differ only in separator placement distinct', () => {
    expect(joinKeySegments(['a:b', 'c'])).not.toBe(
      joinKeySegments(['a', 'b:c']),
    );
  });

  it.each([
    [
      ['acme', 'bob:admin', 'GetUser'],
      ['acme:bob', 'admin', 'GetUser'],
    ],
    [
      ['a\\', 'b'],
      ['a', '\\b'],
    ],
    [
      ['x:', 'y'],
      ['x', ':y'],
    ],
  ])('never collapses %j onto %j', (left, right) => {
    expect(joinKeySegments(left)).not.toBe(joinKeySegments(right));
  });

  it('marks an absent segment instead of dropping it', () => {
    // A dropped tenant would make the multi-tenant key identical to the
    // single-tenant one, silently merging isolation domains.
    expect(joinKeySegments([undefined, 'u-1'])).toBe(`${ABSENT_SEGMENT}:u-1`);
    expect(joinKeySegments([undefined, 'u-1'])).not.toBe(
      joinKeySegments(['u-1']),
    );
  });

  it('distinguishes an absent segment from the empty string', () => {
    expect(joinKeySegments([undefined, 'x'])).not.toBe(
      joinKeySegments(['', 'x']),
    );
  });

  it('cannot be forged by a value that literally contains the absence marker', () => {
    // Escaping only ever emits `\\` or `\:`, so a real segment can never render
    // as the marker itself.
    expect(joinKeySegments([ABSENT_SEGMENT, 'x'])).not.toBe(
      joinKeySegments([undefined, 'x']),
    );
  });

  it('uses a marker that PostgreSQL text columns accept', () => {
    // A PostgreSQL text column rejects U+0000.
    expect(ABSENT_SEGMENT).not.toContain('\u0000');
    expect(joinKeySegments([undefined, 'x'])).not.toContain('\u0000');
  });
});
