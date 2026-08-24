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
  DEAD_LETTER_DEFAULT_OPTIONS,
  DEAD_LETTER_TRANSPORT,
} from './constants/tokens';
export {
  DEAD_LETTER_ITEM,
  DeadLetterBehavior,
} from './dead-letter.behavior';
export { DeadLetterModule } from './dead-letter.module';
export { buildDeadLetterRecord } from './helpers/build-record';
export type {
  DeadLetterBehaviorOptions,
  DeadLetterMetadataFactory,
  DeadLetterModuleAsyncOptions,
  DeadLetterModuleOptions,
} from './interfaces/dead-letter-options.interface';
export type {
  DeadLetterError,
  DeadLetterRecord,
  DeadLetterRequestKind,
  DeadLetterTransport,
} from './interfaces/dead-letter-transport.interface';
export {
  BullMqDeadLetterTransport,
  type BullMqDeadLetterTransportOptions,
  type BullMqQueueLike,
} from './transports/bullmq.transport';
export {
  createDeadLetterTableSql,
  PostgresDeadLetterTransport,
  type PostgresDeadLetterTransportOptions,
  type PostgresQueryableLike,
} from './transports/postgres.transport';
export {
  type RabbitMqChannelLike,
  RabbitMqDeadLetterTransport,
  type RabbitMqDeadLetterTransportOptions,
} from './transports/rabbitmq.transport';
