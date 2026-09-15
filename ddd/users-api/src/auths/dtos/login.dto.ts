/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EmailSchema } from '@common/validation/email.schema';
import { z } from 'zod';

export const LoginDtoSchema = z.object({
  email: EmailSchema,
  code: z.string().min(1),
});

export type LoginDto = z.infer<typeof LoginDtoSchema>;
