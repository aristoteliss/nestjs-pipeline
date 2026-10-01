/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { isSqlIdentifier } from './sql-identifier.js';

describe('isSqlIdentifier', () => {
  it.each(['tenant', 'tenant_a', '_tenant', 'Tenant1'])(
    'accepts the identifier %j',
    (name) => {
      expect(isSqlIdentifier(name)).toBe(true);
    },
  );

  it.each([
    '',
    ' tenant',
    'tenant-a',
    '1tenant',
    'a,b',
    'a b',
    'app.cache',
    '"t"',
  ])('rejects %j', (name) => {
    expect(isSqlIdentifier(name)).toBe(false);
  });

  it('accepts one schema qualifier only when asked', () => {
    expect(isSqlIdentifier('app.cache', { qualified: true })).toBe(true);
    expect(isSqlIdentifier('cache', { qualified: true })).toBe(true);
    expect(isSqlIdentifier('a.b.c', { qualified: true })).toBe(false);
    expect(isSqlIdentifier('app.', { qualified: true })).toBe(false);
  });
});
