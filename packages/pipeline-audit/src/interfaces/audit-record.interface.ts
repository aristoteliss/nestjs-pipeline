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

/** Request kinds as classified by the pipeline. */
export type AuditRequestKind = 'command' | 'query' | 'event' | 'unknown';

/** Whether the audited operation succeeded or threw. */
export type AuditOutcome = 'success' | 'failure';

/** Relative importance of an audited action, for filtering / alerting. */
export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * The principal that triggered the audited action — resolved from the pipeline
 * context (e.g. read from `context.items` populated by an upstream auth
 * behavior). `id` is conventional; arbitrary extra fields are allowed.
 */
export interface AuditActor {
  /** Stable identifier of the actor (user id, service account, api key id). */
  id?: string;
  [key: string]: unknown;
}

/** Serializable description of a failure captured in an audit record. */
export interface AuditError {
  /** Error class name (e.g. `ForbiddenException`), or `'unknown'` for non-Error throws. */
  name: string;
  /** Error message. */
  message: string;
  /** Stack trace, unless suppressed via `includeStack: false`. */
  stack?: string;
}

/**
 * A single audit-trail entry for one pipeline operation (who did what, when,
 * and with what outcome), forwarded to an
 * {@link AuditSink}.
 *
 * Unlike a dead letter (failures only), an audit record is written for **both**
 * successful and failed operations, so denied/rejected attempts are captured too
 * — which is exactly what security and compliance audits need.
 */
export interface AuditRecord {
  /** Unique id for this entry (UUID). */
  id: string;
  /** Correlation ID of the pipeline run (for cross-system tracing). */
  correlationId: string;
  /** Logical action name, e.g. `user.create`. Defaults to the request name. */
  action: string;
  /** Severity of the action. Defaults to `'medium'` (`'low'` for queries). */
  severity: AuditSeverity;
  /** Whether the operation succeeded or failed. */
  outcome: AuditOutcome;
  /** The principal that performed the action, if resolvable. */
  actor?: AuditActor;
  /** Whether the request was a command, query, event, or unknown. */
  requestKind: AuditRequestKind;
  /** Request class name, e.g. `CreateUserCommand`. */
  requestName: string;
  /** Handler class name, e.g. `CreateUserHandler`. */
  handlerName: string;
  /** The request payload (redacted), unless `captureRequest: false`. */
  payload?: unknown;
  /** The handler response (redacted), only when `captureResponse: true`. */
  response?: unknown;
  /** Error details — present only when `outcome` is `'failure'`. */
  error?: AuditError;
  /** Wall-clock duration of the operation in milliseconds. */
  durationMs: number;
  /** ISO-8601 timestamp of when the operation started. */
  timestamp: string;
  /** Optional extra metadata produced by the behavior's `metadata` factory. */
  metadata?: Record<string, unknown>;
}
