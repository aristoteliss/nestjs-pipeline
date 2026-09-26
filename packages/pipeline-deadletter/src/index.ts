/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  DEFAULT_REDACT_KEYS,
  REDACTED,
  redactValue,
} from '@cqrs-ddd/safe-stringify';
export {
  DEAD_LETTER_DEFAULT_OPTIONS,
  DEAD_LETTER_TRANSPORT,
} from './constants/tokens';
export {
  DEAD_LETTER_ITEM,
  DEAD_LETTER_ITEM_TOKEN,
  DeadLetterBehavior,
} from './dead-letter.behavior';
export { DeadLetterModule } from './dead-letter.module';
export {
  type DeadLetterDispatch,
  type DeadLetterRedriveResult,
  DeadLetterRedriver,
  type DeadLetterRedriverOptions,
} from './dead-letter.redriver';
export { DeadLetterRedriveError } from './errors/dead-letter-redrive.error';
export { buildDeadLetterRecord } from './helpers/build-record';
export {
  type DeadLetterIntentOptions,
  deadLetter,
} from './helpers/dead-letter.intent';
export type {
  DeadLetterBehaviorOptions,
  DeadLetterMetadataFactory,
  DeadLetterModuleAsyncOptions,
  DeadLetterModuleOptions,
} from './interfaces/dead-letter-options.interface';
export type {
  DeadLetterError,
  DeadLetterListFilter,
  DeadLetterRecord,
  DeadLetterRequestKind,
  DeadLetterStatus,
  DeadLetterStore,
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
  type RabbitMqConfirmChannelLike,
  RabbitMqDeadLetterTransport,
  type RabbitMqDeadLetterTransportOptions,
} from './transports/rabbitmq.transport';
