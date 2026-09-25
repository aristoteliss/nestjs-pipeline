/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Capability } from '@nestjs-pipeline/casl';

export const USER_PERMISSION_RULES = Symbol('USER_PERMISSION_RULES');

/** Application port for a user's materialized rules. */
export interface IUserPermissionRules {
  /** Every direct rule, then every inverted rule, each group by position. */
  findOrdered(userId: string): Promise<Capability[]>;
}
