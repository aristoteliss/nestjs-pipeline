/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MissingJobContextError } from '../errors/missing-job-context.error.js';
import type { WithJobContext } from '../interfaces/job-context.interface.js';
import { toReference } from './principal-reference.js';
import { activeRegistration } from './registration.js';

/**
 * Stamps the current execution context onto a job payload: the tenant and
 * correlation id of the registered sources (a new one from the correlation
 * source's `create()` when none is active), and the principal the registered `IJobPrincipal`
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
  const { principal, sources } = activeRegistration();
  const tenantId = sources.tenantId.current();
  if (tenantId === undefined) throw new MissingJobContextError('tenant');
  const captured = principal.capture();
  if (captured === undefined) throw new MissingJobContextError('principal');
  return {
    ...data,
    jobContext: {
      tenantId,
      correlationId:
        sources.correlationId.current() ?? sources.correlationId.create(),
      principal: toReference(captured),
    },
  };
}
