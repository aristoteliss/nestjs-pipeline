/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';

export const UpdateRoleDtoSchema = z.object({
  name: z.string().trim().min(3),
});

export type UpdateRoleDto = z.infer<typeof UpdateRoleDtoSchema>;
