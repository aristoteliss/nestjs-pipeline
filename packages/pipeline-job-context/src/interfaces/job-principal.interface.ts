/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PrincipalReference } from './principal-reference.interface';

/**
 * Application port that reads the current principal when a job is enqueued and
 * binds it again when the job runs. The application implements it over its own
 * authentication state; register the implementation with
 * `JobContextModule.forRoot`.
 *
 * @typeParam TGrant - The application's grant type, as declared in `@AsSystem`.
 */
export interface IJobPrincipal<TGrant = unknown> {
  /**
   * The principal of the current execution, or `undefined` when there is none.
   * Only `id`, `type` and `sessionId` of the result are kept.
   */
  capture(): PrincipalReference | undefined;

  /**
   * Re-checks `principal` against current state and runs `work` with it as the
   * current principal. It runs inside the job's tenant and correlation id.
   * Throw to refuse the job, for example for a revoked session or a deleted
   * principal; the job then fails without running.
   *
   * @param grants - Set only for `@AsSystem` work: the complete grants its code
   *   declares. For a job payload it is `undefined`, and the principal's
   *   authorization must be resolved from current state.
   */
  restore<T>(
    principal: PrincipalReference,
    work: () => Promise<T>,
    grants?: readonly TGrant[],
  ): Promise<T>;
}
