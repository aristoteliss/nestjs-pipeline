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

export {
  DEFAULT_IDEMPOTENCY_TTL_MS,
  IDEMPOTENCY_DEFAULT_OPTIONS,
  IDEMPOTENCY_STORE,
} from './constants/tokens';
export {
  IdempotencyConflictError,
  type IdempotencyConflictReason,
} from './errors/idempotency-conflict.error';
export { IdempotencyConflictFilter } from './filters/idempotency-conflict.filter';
export {
  fingerprintValue,
  stableStringify,
} from './helpers/fingerprint';
export {
  IDEMPOTENCY_KEY_ITEM,
  IDEMPOTENCY_OWNERSHIP_LOST_ITEM,
  IDEMPOTENCY_REPLAYED_ITEM,
  IdempotencyBehavior,
} from './idempotency.behavior';
export { IdempotencyModule } from './idempotency.module';
export type {
  IdempotencyBehaviorOptions,
  IdempotencyKeyFactory,
  IdempotencyModuleAsyncOptions,
  IdempotencyModuleOptions,
} from './interfaces/idempotency-options.interface';
export type {
  IdempotencyRecord,
  IdempotencyRequestKind,
  IdempotencyStatus,
} from './interfaces/idempotency-record.interface';
export type {
  IdempotencyStore,
  MaybePromise,
} from './interfaces/idempotency-store.interface';
export { MemoryIdempotencyStore } from './stores/memory.store';
export {
  createIdempotencyTableSql,
  PostgresIdempotencyStore,
  type PostgresIdempotencyStoreOptions,
  type PostgresQueryableLike,
  type PostgresQueryResultLike,
  type PostgresRowLike,
} from './stores/postgres.store';
export {
  type RedisClientLike,
  RedisIdempotencyStore,
  type RedisIdempotencyStoreOptions,
} from './stores/redis.store';
