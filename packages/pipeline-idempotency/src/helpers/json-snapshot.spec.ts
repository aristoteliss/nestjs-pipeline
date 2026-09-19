/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import type { IdempotencyRecord } from '../interfaces/idempotency-record.interface';
import { cloneIdempotencyRecord, toJsonSnapshot } from './json-snapshot';

describe('json-snapshot helpers', () => {
  it('toJsonSnapshot serializes valid JSON values and returns undefined for undefined input', () => {
    expect(toJsonSnapshot(undefined)).toBeUndefined();
    expect(toJsonSnapshot({ a: 1, b: 'str' })).toEqual({ a: 1, b: 'str' });
  });

  it('toJsonSnapshot throws TypeError for non-JSON or cyclic values', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => toJsonSnapshot(cyclic)).toThrow(
      'Idempotency responses must be acyclic JSON-serializable values.',
    );
  });

  it('cloneIdempotencyRecord clones valid records', () => {
    const record: IdempotencyRecord = {
      key: 'k1',
      status: 'completed',
      requestName: 'TestCommand',
      claimId: 'claim-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      response: { data: 'ok' },
    };

    const cloned = cloneIdempotencyRecord(record);
    expect(cloned).toEqual(record);
    expect(cloned).not.toBe(record);
  });

  it('cloneIdempotencyRecord throws TypeError when record contains cyclic/non-serializable references', () => {
    const invalidRecord: any = {
      key: 'k1',
      status: 'completed',
      requestName: 'TestCommand',
      claimId: 'claim-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      response: 42n, // BigInt cannot be serialized by JSON.stringify
    };

    expect(() => cloneIdempotencyRecord(invalidRecord)).toThrow(
      'Idempotency records must contain only acyclic JSON-serializable values.',
    );
  });
});
