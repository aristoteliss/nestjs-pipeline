/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { getCorrelationId } from '@nestjs-pipeline/correlation';
import { currentTenantId } from '@nestjs-pipeline/tenant';
import { MissingJobContextError } from '../errors/missing-job-context.error';
import type { WithJobContext } from '../interfaces/job-context.interface';
import { toReference } from './principal-reference';
import { activeRegistration } from './registration';

/**
 * Stamps the current execution context onto a job payload: the tenant from
 * `@nestjs-pipeline/tenant`, the correlation id from
 * `@nestjs-pipeline/correlation` (generated when none is active, as
 * `getCorrelationId` does), and the principal the registered `IJobPrincipal`
 * captures, reduced to its identity. The processor restores it with
 * `@InJobContext`.
 *
 * @param data - The payload. Must be a plain object; a shallow copy is returned.
 * @returns A copy of `data` with `jobContext` added.
 * @throws {TypeError} When `data` is not a plain object.
 * @throws {MissingJobContextError} Without a running `JobContextModule`, a
 *   current tenant, or a current principal.
 *
 * @example
 * ```ts
 * await queue.add('send', withJobContext({ userId, email }));
 * ```
 */
export function withJobContext<T extends Record<string, unknown>>(
  data: T,
): WithJobContext<T> {
  const prototype =
    data !== null && typeof data === 'object'
      ? Object.getPrototypeOf(data)
      : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(
      'withJobContext(data) requires a plain object payload. Wrap arrays and class instances in a plain object first.',
    );
  }
  const { principal } = activeRegistration();
  const tenantId = currentTenantId();
  if (tenantId === undefined) throw new MissingJobContextError('tenant');
  const captured = principal.capture();
  if (captured === undefined) throw new MissingJobContextError('principal');
  return {
    ...data,
    jobContext: {
      tenantId,
      correlationId: getCorrelationId(),
      principal: toReference(captured),
    },
  };
}
