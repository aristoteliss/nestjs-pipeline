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
import { DEFAULT_REDACT_KEYS, REDACTED, redactValue } from './redact';

describe('redactValue', () => {
  it('masks default sensitive keys', () => {
    const result = redactValue({
      username: 'jane',
      password: 'hunter2',
      token: 'abc',
    });

    expect(result).toEqual({
      username: 'jane',
      password: REDACTED,
      token: REDACTED,
    });
  });

  it('matches keys case-insensitively', () => {
    const result = redactValue({ Password: 'x', AUTHORIZATION: 'Bearer y' });

    expect(result).toEqual({ Password: REDACTED, AUTHORIZATION: REDACTED });
  });

  it('recurses into nested objects and arrays', () => {
    const result = redactValue({
      user: { name: 'jane', secret: 's' },
      tokens: [{ token: 't1' }, { token: 't2' }],
    });

    expect(result).toEqual({
      user: { name: 'jane', secret: REDACTED },
      tokens: [{ token: REDACTED }, { token: REDACTED }],
    });
  });

  it('returns primitives unchanged', () => {
    expect(redactValue('plain')).toBe('plain');
    expect(redactValue(42)).toBe(42);
    expect(redactValue(null)).toBeNull();
    expect(redactValue(undefined)).toBeUndefined();
  });

  it('does not mutate the input', () => {
    const input = { password: 'secret', nested: { pwd: 'p' } };

    redactValue(input);

    expect(input).toEqual({ password: 'secret', nested: { pwd: 'p' } });
  });

  it('honors a custom key list instead of the defaults', () => {
    const result = redactValue({ password: 'kept', email: 'a@b.test' }, [
      'email',
    ]);

    // `password` is not in the custom list, so it is preserved.
    expect(result).toEqual({ password: 'kept', email: REDACTED });
  });

  it('preserves non-plain objects (e.g. Date) verbatim', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');

    const result = redactValue({ when: date }) as { when: Date };

    expect(result.when).toBe(date);
  });

  it('preserves repeated references that are not cyclic', () => {
    const shared = { password: 'secret', value: 1 };
    const result = redactValue({ first: shared, second: shared }) as {
      first: Record<string, unknown>;
      second: Record<string, unknown>;
    };

    expect(result.first).toEqual({ password: REDACTED, value: 1 });
    expect(result.second).toEqual({ password: REDACTED, value: 1 });
  });

  it('does not misclassify a repeated non-plain object as circular', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const result = redactValue({ first: date, second: date }) as {
      first: unknown;
      second: unknown;
    };

    expect(result.first).toBe(date);
    expect(result.second).toBe(date);
  });

  it('guards against cyclic references', () => {
    const cyclic: Record<string, unknown> = { name: 'jane' };
    cyclic.self = cyclic;

    const result = redactValue(cyclic) as Record<string, unknown>;

    expect(result.name).toBe('jane');
    expect(result.self).toBe('[Circular]');
  });

  it('exposes a stable set of default keys', () => {
    expect(DEFAULT_REDACT_KEYS).toContain('password');
    expect(DEFAULT_REDACT_KEYS).toContain('authorization');
    expect(DEFAULT_REDACT_KEYS).toContain('creditCard');
  });
});
