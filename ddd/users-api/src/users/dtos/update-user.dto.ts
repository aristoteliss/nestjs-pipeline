/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';

export const UpdateUserDtoShape = {
  name: z.string().trim().min(3).optional(),
  department: z.string().trim().min(3).nullable().optional(),
};

export const UpdateUserDtoSchema = z
  .object(UpdateUserDtoShape)
  .refine(
    (value) => value.name !== undefined || value.department !== undefined,
    { message: 'At least one mutable field must be supplied.' },
  );

export type UpdateUserDto = z.infer<typeof UpdateUserDtoSchema>;
