/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { runWithCorrelationId, uuidv7 } from '@nestjs-pipeline/correlation';
import { runWithTenant } from '@nestjs-pipeline/tenant';
import { toReference } from '../helpers/principal-reference';
import { activeRegistration } from '../helpers/registration';
import type { PrincipalReference } from '../interfaces/principal-reference.interface';

/** Options of {@link AsSystem}. */
export interface AsSystemOptions<TGrant = unknown> {
  /** The service principal the work acts as. */
  principal: PrincipalReference;
  /** The principal's complete authorization; nothing else grants it anything. */
  grants: readonly TGrant[];
}

/**
 * Runs system-started work, such as a cron job, once per configured tenant.
 * Each run has its own tenant, a new correlation id, and the declared service
 * principal and grants, bound through the registered `IJobPrincipal`. Grants
 * come only from this declaration, never from data.
 *
 * Tenants run one after another. A failing tenant does not stop the others;
 * the method then rejects with an `AggregateError` of the failures. Its return
 * values are discarded. Place it under the scheduling decorator.
 *
 * @example
 * ```ts
 * @Cron('0 3 * * *')
 * @AsSystem({
 *   principal: { id: 'session-cleanup', type: 'service' },
 *   grants: [{ action: 'delete', subject: 'Auth' }],
 * })
 * async purgeSessions() {
 *   await this.commandBus.execute(new PurgeExpiredSessionsCommand());
 * }
 * ```
 */
export function AsSystem<TGrant>(
  options: AsSystemOptions<TGrant>,
): MethodDecorator {
  const reference = toReference(options.principal);
  const grants = [...options.grants];

  return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;

    descriptor.value = async function (
      this: unknown,
      ...args: unknown[]
    ): Promise<void> {
      const { principal, tenants } = activeRegistration();
      const failures: unknown[] = [];
      const failed: string[] = [];
      for (const tenant of tenants) {
        try {
          await runWithTenant(tenant, () =>
            runWithCorrelationId(uuidv7(), () =>
              principal.restore(
                reference,
                async () => original.apply(this, args),
                grants,
              ),
            ),
          );
        } catch (error) {
          failures.push(error);
          failed.push(tenant);
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          `System work failed in tenants: ${failed.join(', ')}`,
        );
      }
    };
    Object.defineProperty(descriptor.value, 'name', {
      value: original.name,
      configurable: true,
    });
    return descriptor;
  };
}
