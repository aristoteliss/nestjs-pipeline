/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type {
  CacheFillOptions,
  CacheSetOptions,
  CacheStateEntry,
  IVersionedCache,
} from '@nestjs-pipeline/ddd-core/application';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '../mikro-orm.store';
import { CacheEntry } from './cache.entity';

export type { CacheSetOptions };

/**
 * MikroOrmCache is the PRIMARY cache implementation for this app.
 * Uses MikroORM for persistence, storing cache entries in the 'cache' table.
 *
 * Implements {@link IVersionedCache} with revision-fenced atomic coordination,
 * bypassing the identity map across all read and mutation operations.
 */
/**
 * Upper bound on compare-and-set re-reads. Each iteration only repeats after a
 * competing writer won the row, so the bound exists to guarantee termination if
 * the underlying store never reflects a write, not to limit real contention.
 */
const MAX_CAS_ATTEMPTS = 16;

/** Raised when a compare-and-set loop cannot converge. */
class CacheCasExhaustedError extends Error {
  constructor(operation: string, key: string) {
    super(
      `MikroOrmCache.${operation} could not settle key "${key}" after ${MAX_CAS_ATTEMPTS} attempts.`,
    );
    this.name = 'CacheCasExhaustedError';
  }
}

@Injectable()
export class MikroOrmCache<T> implements IVersionedCache<T> {
  readonly isVersioned = true as const;

  private readonly logger = new Logger(MikroOrmCache.name);
  private readonly defaultTtlMs: number;

  constructor(
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
    @Optional() options?: { defaultTtlMs?: number },
  ) {
    this.defaultTtlMs = options?.defaultTtlMs ?? 60_000;
  }

  /**
   * Observes the current key state and its revision token.
   * Reads bypass the identity map to guarantee authoritative persistence visibility.
   */
  async readState(key: string): Promise<CacheStateEntry<T>> {
    const entry = await this.store.em.findOne(
      CacheEntry,
      { key },
      { disableIdentityMap: true },
    );

    if (!entry) {
      return { status: 'miss', revision: '0' };
    }

    const revision = (entry.revision ?? '0').toString();

    if (!entry.value) {
      return { status: 'miss', revision };
    }

    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      return { status: 'expired', revision };
    }

    return {
      status: 'hit',
      value: JSON.parse(entry.value) as T,
      revision,
    };
  }

  /**
   * Atomically advances the revision for `key` and evicts the payload value.
   * Retains the entry to prevent ABA races during concurrent fills.
   */
  async invalidate(key: string): Promise<string> {
    return this.store.transactional(async (em) => {
      for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
        const existing = await em.findOne(
          CacheEntry,
          { key },
          { refresh: true, disableIdentityMap: true },
        );

        if (!existing) {
          // `onConflictAction: 'ignore'` keeps a lost insert race from aborting
          // the surrounding transaction, so the loop can re-read and retry.
          await em.upsert(
            CacheEntry,
            { key, value: '', expiresAt: null, revision: '1' },
            { onConflictAction: 'ignore' },
          );
          const inserted = await em.findOne(
            CacheEntry,
            { key },
            { refresh: true, disableIdentityMap: true },
          );
          if (inserted && (inserted.revision ?? '0').toString() === '1') {
            return '1';
          }
          continue;
        }

        const currentRev = (existing.revision ?? '0').toString();
        const nextRevision = (BigInt(currentRev) + 1n).toString();
        const affected = await em.nativeUpdate(
          CacheEntry,
          { key, revision: existing.revision },
          {
            value: '',
            expiresAt: null,
            revision: nextRevision,
          },
        );

        if (affected > 0) {
          return nextRevision;
        }
      }

      throw new CacheCasExhaustedError('invalidate', key);
    });
  }

  /**
   * Atomically checks that current revision matches `observedRevision`, writes
   * value, and advances revision on match.
   */
  async tryFill(
    key: string,
    observedRevision: string,
    value: T,
    options?: CacheFillOptions,
  ): Promise<boolean> {
    const ttl = options?.ttl ?? this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : null;
    const serialized = JSON.stringify(value);

    return this.store.transactional(async (em) => {
      const nextRevision = (BigInt(observedRevision) + 1n).toString();

      if (observedRevision === '0') {
        const existing = await em.findOne(
          CacheEntry,
          { key },
          { refresh: true, disableIdentityMap: true },
        );

        if (!existing) {
          await em.upsert(
            CacheEntry,
            { key, value: serialized, expiresAt, revision: '1' },
            { onConflictAction: 'ignore' },
          );
          const inserted = await em.findOne(
            CacheEntry,
            { key },
            { refresh: true, disableIdentityMap: true },
          );
          // A competing writer won the insert; this fill observed revision 0
          // and must not overwrite it.
          return inserted !== null && inserted.value === serialized;
        }

        if ((existing.revision ?? '0').toString() === '0') {
          const affected = await em.nativeUpdate(
            CacheEntry,
            { key, revision: existing.revision },
            {
              value: serialized,
              expiresAt,
              revision: '1',
            },
          );
          return affected > 0;
        }

        return false;
      }

      const affected = await em.nativeUpdate(
        CacheEntry,
        { key, revision: observedRevision },
        {
          value: serialized,
          expiresAt,
          revision: nextRevision,
        },
      );

      return affected > 0;
    });
  }

  /**
   * Get a value from the cache by key. Handles TTL expiry and returns detached clone.
   */
  async get(key: string): Promise<T | undefined> {
    const state = await this.readState(key);
    return state.status === 'hit' ? state.value : undefined;
  }

  /**
   * Stores a value in the relational cache table with transactional CAS concurrency safety.
   */
  async set(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    const ttl = options?.ttl ?? this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : null;
    const isNewer = options?.isNewer;

    await this.store.transactional(async (em) => {
      for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
        const existing = await em.findOne(
          CacheEntry,
          { key },
          { refresh: true, disableIdentityMap: true },
        );

        if (!existing) {
          await em.upsert(
            CacheEntry,
            { key, value: JSON.stringify(value), expiresAt, revision: '1' },
            { onConflictAction: 'ignore' },
          );
          continue;
        }

        if (isNewer && existing.value) {
          if (existing.expiresAt === null || existing.expiresAt >= Date.now()) {
            let parsed: unknown;
            try {
              parsed = JSON.parse(existing.value);
            } catch {
              // An unparsable entry is treated as absent so the CAS update can heal corrupted data.
              this.logger.warn(
                `Failed to parse cached value (key digest: ${createHash('sha256').update(key).digest('hex')}); treating as absent.`,
              );
            }
            if (parsed !== undefined && isNewer(parsed, value)) {
              return;
            }
          }
        }

        const currentRev = (existing.revision ?? '0').toString();
        const nextRevision = (BigInt(currentRev) + 1n).toString();
        const affected = await em.nativeUpdate(
          CacheEntry,
          { key, revision: existing.revision },
          {
            value: JSON.stringify(value),
            expiresAt,
            revision: nextRevision,
          },
        );

        if (affected > 0) return;
      }

      throw new CacheCasExhaustedError('set', key);
    });
  }

  /**
   * Explicitly evicts a key from the database cache table by advancing its revision.
   */
  async delete(key: string): Promise<void> {
    await this.invalidate(key);
  }
}
