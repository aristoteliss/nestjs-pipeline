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

import { SessionCommand } from '@common/cqrs/commands/session.command';
import { createExecuteClass } from '@common/cqrs/helpers/createExecute.helper';
import { z } from 'zod';

export class UpdateUserCommand extends createExecuteClass(
  z
    .object({
      id: z.uuid(),
      username: z.string().min(5).nullable().optional(),
      department: z.string().min(1).nullable().optional(),
    })
    .refine((data) => data.username !== undefined || data.department !== undefined, {
      message: 'At least one of username or department must be provided',
    }),
  SessionCommand,
) { }
