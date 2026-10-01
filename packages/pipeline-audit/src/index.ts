/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  AUDIT_RECORD_ITEM,
  AUDIT_RECORD_ITEM_TOKEN,
  AUDIT_START_RECORD_ITEM_TOKEN,
  AuditBehavior,
} from './audit.behavior.js';
export { AuditModule } from './audit.module.js';
export {
  AUDIT_DEFAULT_OPTIONS,
  AUDIT_OUTCOMES,
  AUDIT_REQUEST_KINDS,
  AUDIT_SEVERITY,
  AUDIT_SINK,
} from './constants/tokens.js';
export {
  type AuditIntentOptions,
  audit,
} from './helpers/audit.intent.js';
export type {
  BuildAuditRecordInput,
  BuildAuditStartRecordInput,
} from './helpers/build-record.js';
export {
  buildAuditRecord,
  buildAuditStartRecord,
} from './helpers/build-record.js';
export {
  DEFAULT_REDACT_KEYS,
  REDACTED,
  redactValue,
} from './helpers/redact.js';
export type {
  AuditActorFactory,
  AuditBehaviorOptions,
  AuditMetadataFactory,
  AuditModuleAsyncOptions,
  AuditModuleOptions,
  AuditRedactor,
} from './interfaces/audit-options.interface.js';
export type {
  AuditActor,
  AuditError,
  AuditOutcome,
  AuditRecord,
  AuditRequestKind,
  AuditSeverity,
  AuditStartRecord,
} from './interfaces/audit-record.interface.js';
export type { AuditSink } from './interfaces/audit-sink.interface.js';
export {
  type AuditLoggerLike,
  LogAuditSink,
  type LogAuditSinkOptions,
} from './sinks/log.sink.js';
export {
  createAuditTableSql,
  PostgresAuditSink,
  type PostgresAuditSinkOptions,
  type PostgresQueryableLike,
} from './sinks/postgres.sink.js';
