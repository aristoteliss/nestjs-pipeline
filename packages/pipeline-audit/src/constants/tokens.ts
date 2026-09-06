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

/**
 * Injection token holding the {@link import('../interfaces/audit-sink.interface').AuditSink}
 * that audit records are written to, supplied via
 * {@link AuditModule.forRoot} / {@link AuditModule.forRootAsync}.
 */
export const AUDIT_SINK = Symbol('AUDIT_SINK');

/**
 * Injection token holding the module-wide default
 * {@link import('../interfaces/audit-options.interface').AuditBehaviorOptions}
 * merged under each handler's per-pipeline configuration.
 */
export const AUDIT_DEFAULT_OPTIONS = Symbol('AUDIT_DEFAULT_OPTIONS');

/**
 * Relative importance levels of an audited action.
 */
export const AUDIT_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

/**
 * Standard request kinds categorized by the pipeline.
 */
export const AUDIT_REQUEST_KINDS = {
  COMMAND: 'command',
  QUERY: 'query',
  EVENT: 'event',
  UNKNOWN: 'unknown',
} as const;

/**
 * Audit record outcomes.
 */
export const AUDIT_OUTCOMES = {
  SUCCESS: 'success',
  FAILURE: 'failure',
} as const;
