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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
 */
import { z } from 'zod';

export const CreateRoleDtoSchema = z.object({
  name: z.string().min(3),
});

export type CreateRoleDto = z.infer<typeof CreateRoleDtoSchema>;
