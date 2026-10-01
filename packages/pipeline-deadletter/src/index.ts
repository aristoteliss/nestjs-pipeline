/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  DEFAULT_REDACT_KEYS,
  REDACTED,
  redactValue,
} from '@cqrs-ddd/safe-stringify';
export {
  DEAD_LETTER_DEFAULT_OPTIONS,
  DEAD_LETTER_TRANSPORT,
} from './constants/tokens.js';
export {
  DEAD_LETTER_ITEM,
  DEAD_LETTER_ITEM_TOKEN,
  DeadLetterBehavior,
} from './dead-letter.behavior.js';
export { DeadLetterModule } from './dead-letter.module.js';
export {
  type DeadLetterDispatch,
  type DeadLetterRedriveResult,
  DeadLetterRedriver,
  type DeadLetterRedriverOptions,
} from './dead-letter.redriver.js';
export { DeadLetterRedriveError } from './errors/dead-letter-redrive.error.js';
export { buildDeadLetterAttributes } from './helpers/build-attributes.js';
export { buildDeadLetterRecord } from './helpers/build-record.js';
export {
  type DeadLetterIntentOptions,
  deadLetter,
} from './helpers/dead-letter.intent.js';
export type {
  DeadLetterBehaviorOptions,
  DeadLetterMetadataFactory,
  DeadLetterModuleAsyncOptions,
  DeadLetterModuleOptions,
} from './interfaces/dead-letter-options.interface.js';
export type {
  DeadLetterError,
  DeadLetterListFilter,
  DeadLetterRecord,
  DeadLetterRequestKind,
  DeadLetterStatus,
  DeadLetterStore,
  DeadLetterTransport,
} from './interfaces/dead-letter-transport.interface.js';
export {
  BullMqDeadLetterTransport,
  type BullMqDeadLetterTransportOptions,
  type BullMqQueueLike,
} from './transports/bullmq.transport.js';
export {
  createDeadLetterTableSql,
  PostgresDeadLetterTransport,
  type PostgresDeadLetterTransportOptions,
  type PostgresQueryableLike,
} from './transports/postgres.transport.js';
export {
  type RabbitMqConfirmChannelLike,
  RabbitMqDeadLetterTransport,
  type RabbitMqDeadLetterTransportOptions,
} from './transports/rabbitmq.transport.js';
