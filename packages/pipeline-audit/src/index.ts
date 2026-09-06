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
  AUDIT_RECORD_ITEM,
  AuditBehavior,
} from './audit.behavior';
export { AuditModule } from './audit.module';
export {
  AUDIT_DEFAULT_OPTIONS,
  AUDIT_OUTCOMES,
  AUDIT_REQUEST_KINDS,
  AUDIT_SEVERITY,
  AUDIT_SINK,
} from './constants/tokens';
export type { BuildAuditRecordInput } from './helpers/build-record';
export { buildAuditRecord } from './helpers/build-record';
export {
  DEFAULT_REDACT_KEYS,
  REDACTED,
  redactValue,
} from './helpers/redact';
export type {
  AuditActorFactory,
  AuditBehaviorOptions,
  AuditMetadataFactory,
  AuditModuleAsyncOptions,
  AuditModuleOptions,
  AuditRedactor,
} from './interfaces/audit-options.interface';
export type {
  AuditActor,
  AuditError,
  AuditOutcome,
  AuditRecord,
  AuditRequestKind,
  AuditSeverity,
} from './interfaces/audit-record.interface';
export type { AuditSink } from './interfaces/audit-sink.interface';
export {
  type AuditLoggerLike,
  LogAuditSink,
  type LogAuditSinkOptions,
} from './sinks/log.sink';
export {
  createAuditTableSql,
  PostgresAuditSink,
  type PostgresAuditSinkOptions,
  type PostgresQueryableLike,
} from './sinks/postgres.sink';
