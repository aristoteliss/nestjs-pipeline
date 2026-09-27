/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { z } from 'zod';
import { RefreshAuthCommand } from '../application/cqrs/commands/refresh-auth.command';

/**
 * The `refresh_token` cookie of `POST /auths/refresh` and `POST /auths/logout`,
 * with the rule of {@link RefreshAuthCommand}.
 */
export const RefreshTokenDtoSchema =
  RefreshAuthCommand.schema.shape.refreshToken;

export type RefreshTokenDto = z.infer<typeof RefreshTokenDtoSchema>;
