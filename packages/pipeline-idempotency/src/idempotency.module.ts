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

import { type DynamicModule, Module } from '@nestjs/common';
import {
  IDEMPOTENCY_DEFAULT_OPTIONS,
  IDEMPOTENCY_STORE,
} from './constants/tokens';
import { IdempotencyBehavior } from './idempotency.behavior';
import type {
  IdempotencyModuleAsyncOptions,
  IdempotencyModuleOptions,
} from './interfaces/idempotency-options.interface';
import { MemoryIdempotencyStore } from './stores/memory.store';

/**
 * NestJS module that wires an {@link IdempotencyStore} into the
 * {@link IdempotencyBehavior} and binds optional module-wide default options.
 *
 * The store is the only backend-specific piece, so memory, Redis, Postgres, or
 * your own store are interchangeable drop-ins — handler code never changes.
 * When `store` is omitted, a {@link MemoryIdempotencyStore} is used for
 * zero-config single-instance deduplication.
 *
 * @example Zero-config — in-memory deduplication
 * ```ts
 * import { IdempotencyModule } from '@nestjs-pipeline/idempotency';
 *
 * @Module({
 *   imports: [IdempotencyModule.forRoot()],
 * })
 * export class AppModule {}
 * ```
 *
 * @example Redis — shared across instances
 * ```ts
 * IdempotencyModule.forRootAsync({
 *   inject: [REDIS_CLIENT],
 *   useFactory: (client: RedisClientLike) => new RedisIdempotencyStore(client),
 *   defaults: { ttl: 86_400_000 },
 * });
 * ```
 *
 * @example Postgres — no extra infrastructure
 * ```ts
 * IdempotencyModule.forRootAsync({
 *   inject: [PG_POOL],
 *   useFactory: (pool: Pool) => new PostgresIdempotencyStore(pool),
 * });
 * ```
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: static-only configuration class
export class IdempotencyModule {
  /**
   * Registers the behavior with a ready-made store (defaults to
   * {@link MemoryIdempotencyStore} when omitted).
   *
   * @param options - The store and optional module-wide defaults.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRoot(options: IdempotencyModuleOptions = {}): DynamicModule {
    return {
      module: IdempotencyModule,
      global: true,
      providers: [
        IdempotencyBehavior,
        {
          provide: IDEMPOTENCY_STORE,
          useValue: options.store ?? new MemoryIdempotencyStore(),
        },
        {
          provide: IDEMPOTENCY_DEFAULT_OPTIONS,
          useValue: options.defaults ?? {},
        },
      ],
      exports: [
        IdempotencyBehavior,
        IDEMPOTENCY_STORE,
        IDEMPOTENCY_DEFAULT_OPTIONS,
      ],
    };
  }

  /**
   * Registers the behavior, building the store from injected dependencies
   * (e.g. a DI-managed Redis client or pg `Pool`).
   *
   * @param options - Async factory, its injected providers, and optional defaults.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRootAsync(options: IdempotencyModuleAsyncOptions): DynamicModule {
    return {
      module: IdempotencyModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        IdempotencyBehavior,
        {
          provide: IDEMPOTENCY_STORE,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        {
          provide: IDEMPOTENCY_DEFAULT_OPTIONS,
          useValue: options.defaults ?? {},
        },
      ],
      exports: [
        IdempotencyBehavior,
        IDEMPOTENCY_STORE,
        IDEMPOTENCY_DEFAULT_OPTIONS,
      ],
    };
  }
}
