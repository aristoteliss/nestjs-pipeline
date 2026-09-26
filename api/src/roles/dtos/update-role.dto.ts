/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';
import { Role } from '../domain/models/role.entity';

/**
 * Request body for renaming a role. `name` is trimmed and must contain 3 to 128 characters.
 *
 * @example
 * `{ "name": "support-manager" }`
 */
export const UpdateRoleDtoSchema = z.object({
  name: z
    .string()
    .trim()
    .min(Role.rules.name.minLength)
    .max(Role.rules.name.maxLength),
});

export type UpdateRoleDto = z.infer<typeof UpdateRoleDtoSchema>;
