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
import { AuditBehavior } from './audit.behavior';
import { AUDIT_DEFAULT_OPTIONS, AUDIT_SINK } from './constants/tokens';
import type {
  AuditModuleAsyncOptions,
  AuditModuleOptions,
} from './interfaces/audit-options.interface';
import { LogAuditSink } from './sinks/log.sink';

/**
 * NestJS module that wires an {@link AuditSink} into the {@link AuditBehavior}
 * and binds optional module-wide default options.
 *
 * The sink is the only backend-specific piece, so console, Postgres, an event
 * store, or your own sink are interchangeable drop-ins — handler code never
 * changes. When `sink` is omitted, a {@link LogAuditSink} is used for
 * zero-config audit logging.
 *
 * @example Zero-config — audit to the console
 * ```ts
 * import { AuditModule, AuditBehavior } from '@nestjs-pipeline/audit';
 *
 * @Module({
 *   imports: [
 *     AuditModule.forRoot(),
 *     PipelineModule.forRoot({
 *       globalBehaviors: { scope: 'all', before: [AuditBehavior] },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @example Postgres — drop-in replacement
 * ```ts
 * AuditModule.forRootAsync({
 *   inject: [PG_POOL],
 *   useFactory: (pool: Pool) => new PostgresAuditSink(pool, { table: 'audit_log' }),
 *   defaults: { captureRequest: true },
 * });
 * ```
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: static-only configuration class
export class AuditModule {
  /**
   * Registers the behavior with a ready-made sink (defaults to
   * {@link LogAuditSink} when omitted).
   *
   * @param options - The sink and optional module-wide defaults.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRoot(options: AuditModuleOptions = {}): DynamicModule {
    return {
      module: AuditModule,
      global: true,
      providers: [
        AuditBehavior,
        {
          provide: AUDIT_SINK,
          useValue: options.sink ?? new LogAuditSink(),
        },
        { provide: AUDIT_DEFAULT_OPTIONS, useValue: options.defaults ?? {} },
      ],
      exports: [AuditBehavior, AUDIT_SINK, AUDIT_DEFAULT_OPTIONS],
    };
  }

  /**
   * Registers the behavior, building the sink from injected dependencies
   * (e.g. a DI-managed pg `Pool` or message producer).
   *
   * @param options - Async factory, its injected providers, and optional defaults.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRootAsync(options: AuditModuleAsyncOptions): DynamicModule {
    return {
      module: AuditModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        AuditBehavior,
        {
          provide: AUDIT_SINK,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        { provide: AUDIT_DEFAULT_OPTIONS, useValue: options.defaults ?? {} },
      ],
      exports: [AuditBehavior, AUDIT_SINK, AUDIT_DEFAULT_OPTIONS],
    };
  }
}
