/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/core';
import type {
  CacheFillOptions,
  CacheSetOptions,
  CacheStateEntry,
  IVersionedCache,
} from '../cache.interface';
import type { ICacheLogger } from '../cache-logger';
import { consoleCacheLogger, safeWarn } from '../helpers/cache-logger.helper';
import type { IEntityManagerSource } from '../mikro-orm-write-side.command-repository';
import { CacheEntry } from './cache-entry';

/**
 * Reads the committed row inside a CAS transaction, bypassing the identity map
 * so a concurrent writer's revision is always observed.
 */
function readCommittedEntry(em: EntityManager, key: string) {
  return em.findOne(
    CacheEntry,
    { key },
    { refresh: true, disableIdentityMap: true },
  );
}

/**
 * An {@link IEntityManagerSource} that can also run work in a transaction.
 *
 * `transactional` must run `work` on a manager dedicated to that call, never on
 * the caller's request or transaction manager, so the cache's compare-and-set
 * steps commit on their own and never join a surrounding unit of work.
 * `em.fork().transactional(work)` satisfies it.
 */
export interface ITransactionalEntityManagerSource
  extends IEntityManagerSource {
  transactional<T>(work: (em: EntityManager) => Promise<T>): Promise<T>;
}

/** Options for {@link MikroOrmCache}. */
export interface MikroOrmCacheOptions {
  /** Time to live in milliseconds when a write passes none; `0` never expires. Default 60,000. */
  readonly defaultTtlMs?: number;
  /**
   * Receives cache-maintenance warnings. Defaults to `console.warn` with a
   * `[MikroOrmCache]` prefix. See {@link ICacheLogger}.
   */
  readonly logger?: ICacheLogger;
}

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

/**
 * MikroORM-backed {@link IVersionedCache}: one row per key in the table mapped by
 * {@link CacheEntrySchema} (or {@link createCacheEntrySchema}).
 *
 * Implements {@link IVersionedCache} with revision-fenced atomic coordination,
 * bypassing the identity map across all read and mutation operations. Reads use
 * `store.em`; every write runs in `store.transactional(...)`.
 *
 * A plain class with no framework dependency. In a NestJS application, register
 * it with a factory:
 *
 * @example
 * ```ts
 * {
 *   provide: CACHE_TOKEN,
 *   useFactory: (store: AppStore) =>
 *     new MikroOrmCache(store, { logger: new Logger('MikroOrmCache') }),
 *   inject: [STORE],
 * }
 * ```
 */
export class MikroOrmCache<T> implements IVersionedCache<T> {
  readonly isVersioned = true as const;

  private readonly logger: ICacheLogger;
  private readonly defaultTtlMs: number;

  constructor(
    private readonly store: ITransactionalEntityManagerSource,
    options?: MikroOrmCacheOptions,
  ) {
    this.defaultTtlMs = options?.defaultTtlMs ?? 60_000;
    this.logger = options?.logger ?? consoleCacheLogger('MikroOrmCache');
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
        const existing = await readCommittedEntry(em, key);

        if (!existing) {
          // `onConflictAction: 'ignore'` keeps a lost insert race from aborting
          // the surrounding transaction, so the loop can re-read and retry.
          await em.upsert(
            CacheEntry,
            { key, value: '', expiresAt: null, revision: '1' },
            { onConflictAction: 'ignore' },
          );
          const inserted = await readCommittedEntry(em, key);
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
        const existing = await readCommittedEntry(em, key);

        if (!existing) {
          await em.upsert(
            CacheEntry,
            { key, value: serialized, expiresAt, revision: '1' },
            { onConflictAction: 'ignore' },
          );
          const inserted = await readCommittedEntry(em, key);
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
    const serialized = JSON.stringify(value);

    await this.store.transactional(async (em) => {
      for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
        const existing = await readCommittedEntry(em, key);

        if (!existing) {
          await em.upsert(
            CacheEntry,
            { key, value: serialized, expiresAt, revision: '1' },
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
              safeWarn(
                this.logger,
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
            value: serialized,
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
   * Removes the value and advances the key's revision, as invalidate() does; the
   * row is kept.
   */
  async delete(key: string): Promise<void> {
    await this.invalidate(key);
  }
}
