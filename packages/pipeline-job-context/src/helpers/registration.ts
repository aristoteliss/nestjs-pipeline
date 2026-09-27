/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MissingJobContextError } from '../errors/missing-job-context.error';
import type { JobContextSources } from '../interfaces/context-source.interface';
import type { IJobPrincipal } from '../interfaces/job-principal.interface';

/** What `JobContextModule` registers for the decorators, which run outside DI. */
export interface Registration {
  readonly principal: IJobPrincipal;
  readonly tenants: readonly string[];
  readonly sources: JobContextSources;
}

let active: Registration | undefined;

/**
 * Makes `registration` the one the decorators and `withJobContext` use.
 *
 * @example
 * ```ts
 * register({ principal, tenants: ['tenant_a'], sources });
 * ```
 */
export function register(registration: Registration): void {
  active = registration;
}

/**
 * Removes `registration` if it is still the active one, so closing one
 * application does not remove another's.
 *
 * @example
 * ```ts
 * unregister(registration);
 * ```
 */
export function unregister(registration: Registration): void {
  if (active === registration) active = undefined;
}

/**
 * The active registration.
 *
 * @throws {MissingJobContextError} When no `JobContextModule` is running.
 *
 * @example
 * ```ts
 * const { principal, tenants, sources } = activeRegistration();
 * ```
 */
export function activeRegistration(): Registration {
  if (active === undefined) {
    throw new MissingJobContextError('a running JobContextModule');
  }
  return active;
}
