/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';

/** User identifier accepted by user routes. Must be a UUID string. */
export const UserIdDtoSchema = z.uuid();

export type UserIdDto = z.infer<typeof UserIdDtoSchema>;
