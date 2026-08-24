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

import type {
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
} from '@nestjs/common';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import type { IdempotencyRequestKind } from './idempotency-record.interface';
import type { IdempotencyStore } from './idempotency-store.interface';

/**
 * Derives the idempotency key for a request from the pipeline context — e.g. an
 * `Idempotency-Key` header stashed on `context.items` by a controller, or a
 * natural key from the command payload. Return `undefined` to skip
 * deduplication for this request.
 */
export type IdempotencyKeyFactory = (
  context: IPipelineContext,
) => string | undefined;

/** Per-handler idempotency options, mergeable over module-wide defaults. */
export interface IdempotencyBehaviorOptions {
  /**
   * Derives the idempotency key from the request/context. **Required** for the
   * behavior to do anything — without a key (or when it returns `undefined`)
   * the handler runs normally.
   */
  keyFactory?: IdempotencyKeyFactory;

  /**
   * How long a key is remembered, in milliseconds. After this window the key
   * may be reused and a fresh execution occurs. Default `86_400_000` (24h).
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
   * When the handler throws, release the key so the client can safely retry
   * (`true`, default). Set `false` to keep the key claimed and surface a
   * conflict on retry (favors strict at-most-once over retryability).
   */
  releaseOnError?: boolean;
}

/** Options for {@link IdempotencyModule.forRoot}. */
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
 */
export interface IdempotencyModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /** Factory returning the {@link IdempotencyStore} (may be async). */
  useFactory: (
    ...args: never[]
  ) => IdempotencyStore | Promise<IdempotencyStore>;
  /** Providers injected into `useFactory`. */
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  /** Module-wide default options merged under each handler's options. */
  defaults?: IdempotencyBehaviorOptions;
}
