/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { isUuidV7 } from '@cqrs-ddd/uuidv7';
import { describe, expect, it } from 'vitest';
import {
  createCacheMutationBarrier,
  isCacheMutationBarrier,
} from './cache-barrier.helper';

describe('cache-barrier.helper', () => {
  it('creates valid mutation barrier with UUID v7 token', () => {
    const barrier = createCacheMutationBarrier('deleted');

    expect(barrier.__cacheBarrier).toBe(true);
    expect(isUuidV7(barrier.token)).toBe(true);
    expect(barrier.reason).toBe('deleted');
    expect(barrier.createdAt).toBeGreaterThan(0);
    expect(barrier.aggregateId).toBeUndefined();
    expect(barrier.version).toBeUndefined();
  });

  it('guarantees unique tokens across consecutive creations for ABA detection', () => {
    const b1 = createCacheMutationBarrier('deleted', { id: 'u1', version: 1 });
    const b2 = createCacheMutationBarrier('deleted', { id: 'u1', version: 1 });

    expect(b1.token).not.toBe(b2.token);
  });

  it('extracts aggregateId and version metadata when present', () => {
    const barrier = createCacheMutationBarrier('invalidated', {
      id: 'usr-42',
      version: 3,
    });

    expect(barrier.reason).toBe('invalidated');
    expect(barrier.aggregateId).toBe('usr-42');
    expect(barrier.version).toBe(3);
  });

  it('correctly identifies mutation barriers with type guard', () => {
    const barrier = createCacheMutationBarrier('deleted');
    expect(isCacheMutationBarrier(barrier)).toBe(true);

    expect(isCacheMutationBarrier(null)).toBe(false);
    expect(isCacheMutationBarrier(undefined)).toBe(false);
    expect(isCacheMutationBarrier({})).toBe(false);
    expect(isCacheMutationBarrier({ id: '1', version: 2 })).toBe(false);
    expect(isCacheMutationBarrier({ __deleted: true })).toBe(false);
  });

  it('extracts version from _version when version property is absent', () => {
    const barrier = createCacheMutationBarrier('invalidated', {
      id: 'usr-42',
      _version: 5,
    });
    expect(barrier.version).toBe(5);
  });
});
