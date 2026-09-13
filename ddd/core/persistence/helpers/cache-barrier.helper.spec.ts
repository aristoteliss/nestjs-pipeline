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

import { isUuidV7 } from '@nestjs-pipeline/core';
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
});
