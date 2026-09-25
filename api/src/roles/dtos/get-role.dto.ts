/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';

/** Role identifier accepted by role routes. Must be a UUID string. */
export const RoleIdDtoSchema = z.uuid();

export type RoleIdDto = z.infer<typeof RoleIdDtoSchema>;
