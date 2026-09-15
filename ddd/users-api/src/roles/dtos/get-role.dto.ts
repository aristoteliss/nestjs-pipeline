/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';

export const RoleIdDtoSchema = z.uuid();

export type RoleIdDto = z.infer<typeof RoleIdDtoSchema>;
