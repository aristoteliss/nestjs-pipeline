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

import { randomUUID } from 'node:crypto';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import type { AuditBehaviorOptions } from '../interfaces/audit-options.interface';
import type {
  AuditError,
  AuditRecord,
  AuditSeverity,
} from '../interfaces/audit-record.interface';
import { DEFAULT_REDACT_KEYS, redactValue } from './redact';

/** Inputs describing the completed (or failed) pipeline run. */
export interface BuildAuditRecordInput {
  /** The pipeline context of the audited request. */
  context: IPipelineContext;
  /** Effective, merged behavior options. */
  options: AuditBehaviorOptions;
  /** The handler return value (used only when `captureResponse` is on). */
  response?: unknown;
  /** The thrown value, if the handler failed. */
  error?: unknown;
  /** Explicit execution state; thrown `undefined` is still a failure. */
  failed: boolean;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** ISO-8601 start timestamp. */
  startedAt: string;
}

/**
 * Build an {@link AuditRecord} from a completed pipeline run.
 *
 * Applies redaction to the payload/response, resolves the actor, severity, and
 * action, and normalizes non-`Error` throws to a well-formed error shape. Atomic
 * values are retained, so captured values must still satisfy the selected
 * sink's serialization requirements.
 */
export function buildAuditRecord(input: BuildAuditRecordInput): AuditRecord {
  const { context, options, response, error, failed, durationMs, startedAt } =
    input;

  const record: AuditRecord = {
    id: randomUUID(),
    correlationId: context.correlationId,
    action: options.action ?? context.requestName,
    severity: resolveSeverity(context, options),
    outcome: failed ? 'failure' : 'success',
    actor: options.actor?.(context),
    requestKind: context.requestKind,
    requestName: context.requestName,
    handlerName: context.handlerName,
    durationMs,
    timestamp: startedAt,
    metadata: options.metadata?.(context),
  };

  if (options.captureRequest ?? true) {
    record.payload = sanitize(context.request, options);
  }
  if ((options.captureResponse ?? false) && !failed) {
    record.response = sanitize(response, options);
  }
  if (failed) {
    record.error = toAuditError(error, options);
  }

  return record;
}

/** Redact a value using a custom redactor or the default key-masking. */
function sanitize(value: unknown, options: AuditBehaviorOptions): unknown {
  if (options.redact) return options.redact(value);
  const keys = options.redactKeys
    ? [...DEFAULT_REDACT_KEYS, ...options.redactKeys]
    : DEFAULT_REDACT_KEYS;
  return redactValue(value, keys);
}

/** Default severity: explicit option, else `'low'` for queries, `'medium'` otherwise. */
function resolveSeverity(
  context: IPipelineContext,
  options: AuditBehaviorOptions,
): AuditSeverity {
  if (options.severity) return options.severity;
  return context.requestKind === 'query' ? 'low' : 'medium';
}

function toAuditError(
  error: unknown,
  options: AuditBehaviorOptions,
): AuditError {
  const isError = error instanceof Error;
  return {
    name: isError ? error.name : 'unknown',
    message: isError ? error.message : String(error),
    stack: options.includeStack === false || !isError ? undefined : error.stack,
  };
}
