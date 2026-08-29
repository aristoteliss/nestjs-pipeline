/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { EmailSchema } from '@common/validation/email.schema';
import { z } from 'zod';

export const CreateUserDtoSchema = z.object({
  email: EmailSchema,
  name: z.string().trim().min(3),
  department: z.string().trim().min(3).optional(),
});

export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;
