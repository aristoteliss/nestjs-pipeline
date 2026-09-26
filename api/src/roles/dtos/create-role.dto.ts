/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';
import { Role } from '../domain/models/role.entity';

/**
 * Request body for creating a role. `name` is trimmed and must contain 3 to 128 characters.
 *
 * @example
 * `{ "name": "manager" }`
 */
export const CreateRoleDtoSchema = z.object({
  name: z
    .string()
    .trim()
    .min(Role.rules.name.minLength)
    .max(Role.rules.name.maxLength),
});

export type CreateRoleDto = z.infer<typeof CreateRoleDtoSchema>;
