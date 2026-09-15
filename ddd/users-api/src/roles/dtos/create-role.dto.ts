/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';

export const CreateRoleDtoSchema = z.object({
  name: z.string().trim().min(3),
});

export type CreateRoleDto = z.infer<typeof CreateRoleDtoSchema>;
