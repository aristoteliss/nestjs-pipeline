/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type {
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
} from '@nestjs/common';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import type { IdempotencyRequestKind } from './idempotency-record.interface';
import type { IdempotencyStore } from './idempotency-store.interface';

/**
 * Derives the digest of the authorization scope a request runs under.
 *
 * Returned value is compared, not interpreted: any deterministic string works,
 * and it should cover every dimension whose change must stop a stored response
 * from being replayed — the effective permission rules and the trusted context
 * their conditions resolve against.
 *
 * Throw when the required context is missing rather than returning a placeholder;
 * the behavior calls this **before** claiming the key, so a throw prevents the
 * operation from being claimed at all. Returning `undefined` means "this request
 * has no scope", which cannot be replayed against a record that has one.
 */
export type IdempotencyReplayScopeFactory = (
  context: IPipelineContext,
) => string | undefined;

/**
 * Derives the idempotency key for a request from the pipeline context. A common
 * HTTP pattern is to copy the `Idempotency-Key` header into the CQRS command at
 * the controller boundary and read it from `context.request`. An upstream
 * behavior may alternatively place application metadata in `context.items`.
 * Return `undefined` to skip deduplication for this request.
 */
export type IdempotencyKeyFactory = (
  context: IPipelineContext,
) => string | undefined;

/**
 * Per-handler idempotency options, shallow-merged over module-wide defaults.
 *
 * @example Tenant/principal-scoped command idempotency
 * ```ts
 * @UsePipeline([IdempotencyBehavior, {
 *   keyFactory: (ctx) => {
 *     const command = ctx.request as CreateUserCommand;
 *     return `${ctx.tenantId}:${command.sessionUser?.id}:user.create:${command.email}`;
 *   },
 *   ttl: 24 * 60 * 60 * 1000,
 * }])
 * export class CreateUserHandler {}
 * ```
 */
export interface IdempotencyBehaviorOptions {
  /**
   * Derives the idempotency key from the request/context. **Required** for the
   * behavior to do anything — without a key (or when it returns `undefined`)
   * the handler runs normally. Include tenant/principal ownership whenever a
   * replay would otherwise bypass handler-level authorization.
   */
  keyFactory?: IdempotencyKeyFactory;

  /**
   * How long a key is remembered, in milliseconds. After this window the key
   * may be reused and a fresh execution occurs. Successful completion restarts
   * the TTL for the replay record. Must be a positive safe integer. Default
   * `86_400_000` (24h).
   */
  ttl?: number;

  /**
   * Which request kinds this policy applies to. Default `['command']` — queries
   * are naturally idempotent and usually want {@link import('@nestjs-pipeline/cache')}
   * instead.
   */
  scope?: IdempotencyRequestKind[];

  /**
   * Hash the request payload and reject a later call that reuses the same key
   * with a *different* body (`422`). Default `true`. Disable if your key already
   * fully identifies the payload.
   */
  fingerprint?: boolean;

  /**
   * Binds replay to the caller's authorization scope while keeping the operation
   * key stable.
   *
   * The digest is captured when the key is claimed and stored on the record. A
   * later duplicate may only replay the stored response when its digest matches;
   * a mismatch, or a record stored without one, raises
   * `IdempotencyConflictError` with reason `replay_scope` (`409`). The record is
   * neither deleted nor re-executed, so a permission change can never cause the
   * side effect to run twice.
   *
   * Configure it for any operation whose response or effect depends on the
   * caller's permissions. Without it, replay is bound only by the key and the
   * payload fingerprint.
   */
  replayScopeFactory?: IdempotencyReplayScopeFactory;

  /**
   * When the handler throws, release the key so the client can safely retry
   * (`true`, default). Set `false` to keep the key claimed and surface a
   * conflict on retry (favors strict at-most-once over retryability).
   */
  releaseOnError?: boolean;
}

/**
 * Options for {@link IdempotencyModule.forRoot}.
 *
 * @example Local/single-process setup
 * ```ts
 * IdempotencyModule.forRoot({
 *   defaults: { fingerprint: true, releaseOnError: true },
 * });
 * ```
 *
 * @example Shared Redis store
 * ```ts
 * IdempotencyModule.forRoot({
 *   store: new RedisIdempotencyStore(redisClient),
 * });
 * ```
 */
export interface IdempotencyModuleOptions {
  /**
   * The idempotency store. Pass a bundled store
   * ({@link MemoryIdempotencyStore}, {@link RedisIdempotencyStore},
   * {@link PostgresIdempotencyStore}) or your own {@link IdempotencyStore}.
   * Defaults to {@link MemoryIdempotencyStore} (single-instance only).
   */
  store?: IdempotencyStore;
  /** Module-wide default options merged under each handler's options. */
  defaults?: IdempotencyBehaviorOptions;
}

/**
 * Options for {@link IdempotencyModule.forRootAsync} — build the store from
 * injected dependencies (e.g. a DI-managed Redis client or pg `Pool`).
 *
 * @example
 * ```ts
 * IdempotencyModule.forRootAsync({
 *   inject: [PG_POOL],
 *   useFactory: (pool) => new PostgresIdempotencyStore(pool),
 * });
 * ```
 */
export interface IdempotencyModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /** Factory returning the {@link IdempotencyStore} (may be async). */
  useFactory: (
    ...args: never[]
  ) => IdempotencyStore | Promise<IdempotencyStore>;
  /** Providers injected into {@link useFactory}. */
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  /** Module-wide default options merged under each handler's options. */
  defaults?: IdempotencyBehaviorOptions;
}
