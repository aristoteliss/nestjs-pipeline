/* Copyright (C) 2026-present Aristotelis — see repository license. */

export { stableStringify } from '@nestjs-pipeline/core';
export {
  DEFAULT_IDEMPOTENCY_TTL_MS,
  IDEMPOTENCY_DEFAULT_OPTIONS,
  IDEMPOTENCY_STORE,
} from './constants/tokens';
export {
  IdempotencyCompletionError,
  type IdempotencyFinalizationPhase,
} from './errors/idempotency-completion.error';
export {
  IdempotencyConflictError,
  type IdempotencyConflictReason,
} from './errors/idempotency-conflict.error';
export {
  type IdempotencyPartitionDimension,
  MissingIdempotencyPartitionError,
} from './errors/missing-partition.error';
export { IdempotencyConflictFilter } from './filters/idempotency-conflict.filter';
export { fingerprintValue } from './helpers/fingerprint';
export {
  type IdempotencyIntentOptions,
  idempotent,
} from './helpers/idempotency.intent';
export {
  createPartitionedIdempotencyKeyFactory,
  type IdempotencyOperationFactory,
  type IdempotencyPrincipalFactory,
  type PartitionedIdempotencyKeyOptions,
} from './helpers/partitioned-key';
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
  IdempotencyReplayScopeFactory,
} from './interfaces/idempotency-options.interface';
export type {
  IdempotencyRecord,
  IdempotencyRequestKind,
  IdempotencyStatus,
  JsonValue,
} from './interfaces/idempotency-record.interface';
export type {
  IdempotencyStore,
  MaybePromise,
} from './interfaces/idempotency-store.interface';
export {
  MemoryIdempotencyStore,
  type MemoryIdempotencyStoreOptions,
} from './stores/memory.store';
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
