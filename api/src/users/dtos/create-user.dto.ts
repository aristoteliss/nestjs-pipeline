/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EmailSchema } from '@common/validation/email.schema';
import { z } from 'zod';
import { User } from '../domain/models/user.entity';

/**
 * Request body for creating a user.
 *
 * @example
 * `{ "email": "user@example.com", "name": "Jane Doe", "department": "Support" }`
 */
export const CreateUserDtoSchema = z.object({
  email: EmailSchema,
  name: z
    .string()
    .trim()
    .min(User.rules.username.minLength)
    .max(User.rules.username.maxLength),
  department: z
    .string()
    .trim()
    .min(User.rules.department.minLength)
    .max(User.rules.department.maxLength)
    .optional(),
});

export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;
