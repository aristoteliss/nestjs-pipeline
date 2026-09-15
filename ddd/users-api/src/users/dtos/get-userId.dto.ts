/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';

export const UserIdDtoSchema = z.uuid();

export type UserIdDto = z.infer<typeof UserIdDtoSchema>;
