/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';

/**
 * Request body for creating a role. `name` is trimmed and must contain at least 3 characters.
 *
 * @example
 * `{ "name": "manager" }`
 */
export const CreateRoleDtoSchema = z.object({
  name: z.string().trim().min(3),
});

export type CreateRoleDto = z.infer<typeof CreateRoleDtoSchema>;
