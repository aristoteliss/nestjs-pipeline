/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';

/**
 * The `refresh_token` cookie of `POST /auths/refresh` and `POST /auths/logout`.
 */
export const RefreshTokenDtoSchema = z.string().min(1);

export type RefreshTokenDto = z.infer<typeof RefreshTokenDtoSchema>;
