/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';

/**
 * Request body for renaming a role. `name` is trimmed and must contain at least 3 characters.
 *
 * @example
 * `{ "name": "support-manager" }`
 */
export const UpdateRoleDtoSchema = z.object({
  name: z.string().trim().min(3),
});

export type UpdateRoleDto = z.infer<typeof UpdateRoleDtoSchema>;
