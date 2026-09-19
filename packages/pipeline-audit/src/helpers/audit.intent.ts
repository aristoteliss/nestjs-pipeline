/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@nestjs-pipeline/core';
import { AuditBehavior } from '../audit.behavior';
import type { AuditBehaviorOptions } from '../interfaces/audit-options.interface';

export type AuditIntentOptions = AuditBehaviorOptions;

/**
 * Returns an audit behavior entry for `@UsePipeline`.
 * @param options Per-handler audit options; omitted fields use behavior defaults.
 * @returns The behavior class and options tuple.
 * @example
 * ```ts
 * @UsePipeline(audit({ action: 'user.delete', severity: 'high' }))
 * ```
 */
export function audit(
  options: AuditIntentOptions = {},
): PipelineBehaviorTuple<AuditBehavior, AuditBehaviorOptions> {
  return [AuditBehavior, options];
}
