/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { currentScope, runInScope } from './execution-scope';

describe('execution scope', () => {
  it('is empty outside any scope', () => {
    expect(currentScope()).toEqual({});
  });

  it('lays values over the current scope for the callback only, across awaits', async () => {
    await runInScope(
      { tenantId: 'tenant-a', correlationId: 'corr-1' },
      async () => {
        await Promise.resolve();
        await runInScope({ correlationId: 'corr-2' }, async () => {
          await Promise.resolve();
          expect(currentScope()).toEqual({
            tenantId: 'tenant-a',
            correlationId: 'corr-2',
          });
        });
        expect(currentScope()).toEqual({
          tenantId: 'tenant-a',
          correlationId: 'corr-1',
        });
      },
    );
    expect(currentScope()).toEqual({});
  });

  it('clears a value set explicitly to undefined', () => {
    runInScope({ tenantId: 'tenant-a' }, () =>
      runInScope({ tenantId: undefined }, () =>
        expect(currentScope().tenantId).toBeUndefined(),
      ),
    );
  });

  it('returns what the callback returns', () => {
    expect(runInScope({}, () => 42)).toBe(42);
  });
});
