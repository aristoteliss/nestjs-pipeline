/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Identity of the principal a job acts for. It carries no grants: what the
 * principal may do is resolved again when the job runs.
 */
export interface PrincipalReference {
  readonly id: string;
  /** Application-defined classification, such as `'user'` or `'service'`. */
  readonly type: string;
  /** Login session the principal authenticated with; absent when it has none. */
  readonly sessionId?: string;
}
