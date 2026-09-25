/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DEFAULT_REDACT_KEYS, redactValue } from '@cqrs-ddd/safe-stringify';
import { type IPipelineContext } from '@nestjs-pipeline/core';
import type { DeadLetterBehaviorOptions } from '../interfaces/dead-letter-options.interface';
import type { DeadLetterRecord } from '../interfaces/dead-letter-transport.interface';

/** Redact a payload using a custom redactor or key-based masking. */
function sanitizePayload(
  payload: unknown,
  options: DeadLetterBehaviorOptions,
): unknown {
  if (options.redact) return options.redact(payload);
  const keys = options.redactKeys
    ? [...DEFAULT_REDACT_KEYS, ...options.redactKeys]
    : DEFAULT_REDACT_KEYS;
  return redactValue(payload, keys);
}

/**
 * Build a transport-neutral {@link DeadLetterRecord} from a failed pipeline run.
 *
 * Non-`Error` throws are normalized to a record with `name: 'unknown'` so the
 * transport always receives a well-formed shape.
 *
 * @param context - The pipeline context of the failed request.
 * @param error - The thrown value (any type).
 * @param options - Effective behavior options (controls stack inclusion + metadata).
 */
export function buildDeadLetterRecord(
  context: IPipelineContext,
  error: unknown,
  options: DeadLetterBehaviorOptions = {},
): DeadLetterRecord {
  const isError = error instanceof Error;
  const userMetadata = options.metadata?.(context);

  return {
    correlationId: context.correlationId,
    tenantId: context.tenantId,
    requestKind: context.requestKind,
    requestName: context.requestName,
    handlerName: context.handlerName,
    payload: sanitizePayload(context.request, options),
    error: {
      name: isError ? error.name : 'unknown',
      message: isError ? error.message : String(error),
      stack:
        options.includeStack === false || !isError ? undefined : error.stack,
    },
    failedAt: new Date().toISOString(),
    metadata:
      userMetadata || context.tenantId
        ? {
            ...(userMetadata ?? {}),
            ...(context.tenantId ? { tenantId: context.tenantId } : {}),
          }
        : undefined,
  };
}
