/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { uuidv7 } from '@cqrs-ddd/uuidv7';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import type { AuditBehaviorOptions } from '../interfaces/audit-options.interface';
import type {
  AuditError,
  AuditRecord,
  AuditSeverity,
  AuditStartRecord,
} from '../interfaces/audit-record.interface';
import { DEFAULT_REDACT_KEYS, redactValue } from './redact';

/** Inputs describing an operation about to run. */
export interface BuildAuditStartRecordInput {
  /** The pipeline context of the audited request. */
  context: IPipelineContext;
  /** Effective, merged behavior options. */
  options: AuditBehaviorOptions;
  /** Record id. Default: a new UUIDv7. */
  id?: string;
  /** ISO-8601 start timestamp. */
  startedAt: string;
}

/** Inputs describing the completed (or failed) pipeline run. */
export interface BuildAuditRecordInput extends BuildAuditStartRecordInput {
  /** The handler return value (used only when `captureResponse` is on). */
  response?: unknown;
  /** The thrown value, if the handler failed. */
  error?: unknown;
  /** Explicit execution state; thrown `undefined` is still a failure. */
  failed: boolean;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

/**
 * Build the pending {@link AuditStartRecord} of an operation about to run:
 * everything known before the handler, with `outcome: 'pending'`.
 *
 * Pass its `id` to {@link buildAuditRecord} so the final record replaces it.
 */
export function buildAuditStartRecord(
  input: BuildAuditStartRecordInput,
): AuditStartRecord {
  return { ...buildCommonFields(input), outcome: 'pending' };
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
  const { options, response, error, failed, durationMs } = input;

  const record: AuditRecord = {
    ...buildCommonFields(input),
    outcome: failed ? 'failure' : 'success',
    durationMs,
  };

  if ((options.captureResponse ?? false) && !failed) {
    record.response = sanitize(response, options);
  }
  if (failed) {
    record.error = toAuditError(error, options);
  }

  return record;
}

/** The fields a start record and a final record share. */
function buildCommonFields(
  input: BuildAuditStartRecordInput,
): Omit<AuditStartRecord, 'outcome'> {
  const { context, options, startedAt } = input;
  const userMetadata = options.metadata?.(context);

  return {
    id: input.id ?? uuidv7(),
    correlationId: context.correlationId,
    tenantId: context.tenantId,
    action: options.action ?? context.requestName,
    severity: resolveSeverity(context, options),
    actor: options.actor?.(context),
    requestKind: context.requestKind,
    requestName: context.requestName,
    handlerName: context.handlerName,
    timestamp: startedAt,
    metadata:
      userMetadata || context.tenantId
        ? {
            ...(userMetadata ?? {}),
            ...(context.tenantId ? { tenantId: context.tenantId } : {}),
          }
        : undefined,
    ...((options.captureRequest ?? true)
      ? { payload: sanitize(context.request, options) }
      : {}),
  };
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
