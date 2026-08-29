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
  DEAD_LETTER_DEFAULT_OPTIONS,
  DEAD_LETTER_TRANSPORT,
} from './constants/tokens';
import { DeadLetterBehavior } from './dead-letter.behavior';
import type {
  DeadLetterModuleAsyncOptions,
  DeadLetterModuleOptions,
} from './interfaces/dead-letter-options.interface';

/**
 * NestJS module that wires a {@link DeadLetterTransport} into the
 * {@link DeadLetterBehavior} and binds optional module-wide default options.
 *
 * The transport is the only backend-specific piece, so the bundled BullMQ,
 * RabbitMQ, and Postgres transports are interchangeable drop-ins — handler code
 * never changes. `forRoot()` requires a transport; none is selected implicitly.
 *
 * @example BullMQ — synchronous transport
 * ```ts
 * import { DeadLetterModule, BullMqDeadLetterTransport } from '@nestjs-pipeline/deadletter';
 * import { Queue } from 'bullmq';
 *
 * const queue = new Queue('dead-letters', { connection: { host: 'localhost', port: 6379 } });
 *
 * @Module({
 *   imports: [
 *     DeadLetterModule.forRoot({ transport: new BullMqDeadLetterTransport(queue) }),
 *     PipelineModule.forRoot({ behaviors: [DeadLetterBehavior] }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @example BullMQ via DI (`@nestjs/bullmq`)
 * ```ts
 * DeadLetterModule.forRootAsync({
 *   imports: [BullModule.registerQueue({ name: 'dead-letters' })],
 *   inject: [getQueueToken('dead-letters')],
 *   useFactory: (queue: Queue) => new BullMqDeadLetterTransport(queue),
 * });
 * ```
 *
 * @example RabbitMQ — drop-in replacement
 * ```ts
 * DeadLetterModule.forRootAsync({
 *   inject: [AMQP_CHANNEL],
 *   useFactory: (channel: Channel) =>
 *     new RabbitMqDeadLetterTransport(channel, { routingKey: 'dead-letters' }),
 * });
 * ```
 *
 * @example Postgres — drop-in replacement
 * ```ts
 * DeadLetterModule.forRootAsync({
 *   inject: [PG_POOL],
 *   useFactory: (pool: Pool) =>
 *     new PostgresDeadLetterTransport(pool, { table: 'dead_letters' }),
 * });
 * ```
 */
@Module({})
export class DeadLetterModule {
  /**
   * Registers the behavior with a ready-made transport instance.
   *
   * @param options - The transport and optional module-wide defaults.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRoot(options: DeadLetterModuleOptions): DynamicModule {
    return {
      module: DeadLetterModule,
      global: true,
      providers: [
        DeadLetterBehavior,
        { provide: DEAD_LETTER_TRANSPORT, useValue: options.transport },
        {
          provide: DEAD_LETTER_DEFAULT_OPTIONS,
          useValue: options.defaults ?? {},
        },
      ],
      exports: [
        DeadLetterBehavior,
        DEAD_LETTER_TRANSPORT,
        DEAD_LETTER_DEFAULT_OPTIONS,
      ],
    };
  }

  /**
   * Registers the behavior, building the transport from injected dependencies
   * (e.g. a DI-managed BullMQ queue, AMQP channel, or pg `Pool`).
   *
   * @param options - Async factory, its injected providers, and optional defaults.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRootAsync(options: DeadLetterModuleAsyncOptions): DynamicModule {
    return {
      module: DeadLetterModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        DeadLetterBehavior,
        {
          provide: DEAD_LETTER_TRANSPORT,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        {
          provide: DEAD_LETTER_DEFAULT_OPTIONS,
          useValue: options.defaults ?? {},
        },
      ],
      exports: [
        DeadLetterBehavior,
        DEAD_LETTER_TRANSPORT,
        DEAD_LETTER_DEFAULT_OPTIONS,
      ],
    };
  }
}
