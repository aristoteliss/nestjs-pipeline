/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { InvalidJobContextError } from '../errors/invalid-job-context.error.js';
import { MissingJobContextError } from '../errors/missing-job-context.error.js';
import type { JobContext } from '../interfaces/job-context.interface.js';
import { toReference } from './principal-reference.js';

const CONTEXT_FIELDS = new Set(['tenantId', 'correlationId', 'principal']);
const PRINCIPAL_FIELDS = new Set(['id', 'type', 'sessionId']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function assertFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  name: string,
): void {
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra !== undefined) {
    throw new InvalidJobContextError(`${name} carries the field "${extra}"`);
  }
}

/**
 * Validates a job payload's context before anything runs with it. Every field
 * is checked, unknown fields are refused, the tenant must be configured, and
 * the correlation id must be one `acceptsCorrelationId` accepts.
 *
 * @param value - The payload's `jobContext` value, as read from the queue.
 * @param tenants - The configured tenants.
 * @param acceptsCorrelationId - The correlation source's `accepts`.
 * @returns A context holding only the validated fields.
 * @throws {MissingJobContextError} When `value` is `undefined`.
 * @throws {InvalidJobContextError} For any other value that is not a valid context.
 *
 * @example
 * ```ts
 * const context = parseJobContext(job.data.jobContext, ['tenant_a'], sources.correlationId.accepts);
 * ```
 */
export function parseJobContext(
  value: unknown,
  tenants: readonly string[],
  acceptsCorrelationId: (id: string) => boolean,
): JobContext {
  if (value === undefined) {
    throw new MissingJobContextError('the payload has no jobContext');
  }
  if (!isRecord(value)) {
    throw new InvalidJobContextError('jobContext is not an object');
  }
  assertFields(value, CONTEXT_FIELDS, 'jobContext');
  const { tenantId, correlationId, principal } = value;
  if (typeof tenantId !== 'string' || !tenants.includes(tenantId)) {
    throw new InvalidJobContextError('tenantId is not a configured tenant');
  }
  if (
    typeof correlationId !== 'string' ||
    !acceptsCorrelationId(correlationId)
  ) {
    throw new InvalidJobContextError('correlationId is malformed');
  }
  if (!isRecord(principal)) {
    throw new InvalidJobContextError('principal is not an object');
  }
  assertFields(principal, PRINCIPAL_FIELDS, 'principal');
  const { id, type, sessionId } = principal;
  if (
    !isText(id) ||
    !isText(type) ||
    (sessionId !== undefined && !isText(sessionId))
  ) {
    throw new InvalidJobContextError('principal is malformed');
  }
  return {
    tenantId,
    correlationId,
    principal: toReference({ id, type, sessionId }),
  };
}
