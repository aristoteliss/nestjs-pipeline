/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PrincipalReference } from './principal-reference.interface.js';

/** Execution context a job payload carries from the request that enqueued it. */
export interface JobContext {
  readonly tenantId: string;
  readonly correlationId: string;
  readonly principal: PrincipalReference;
}

/** A job payload stamped by `withJobContext`. */
export type WithJobContext<T extends Record<string, unknown>> = T & {
  jobContext: JobContext;
};
