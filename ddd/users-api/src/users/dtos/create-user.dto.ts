/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EmailSchema } from '@common/validation/email.schema';
import { z } from 'zod';

/**
 * Request body for creating a user.
 *
 * @example
 * `{ "email": "user@example.com", "name": "Jane Doe", "department": "Support" }`
 */
export const CreateUserDtoSchema = z.object({
  email: EmailSchema,
  name: z.string().trim().min(3),
  department: z.string().trim().min(3).optional(),
});

export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;
