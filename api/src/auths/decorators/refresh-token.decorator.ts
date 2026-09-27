/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { InvalidRefreshTokenError } from '../domain/errors/refresh-token.errors';
import {
  type RefreshTokenDto,
  RefreshTokenDtoSchema,
} from '../dtos/refresh-token.dto';
import { REFRESH_COOKIE } from '../services/session.service';

interface CookieRequest {
  cookies?: Record<string, string | undefined>;
}

/**
 * Injects the `refresh_token` cookie, validated by {@link RefreshTokenDtoSchema}.
 * A missing or invalid cookie is rejected with `InvalidRefreshTokenError`
 * (401, `code: refresh_invalid`); with `{ optional: true }` a missing or empty
 * cookie is injected as `undefined` instead.
 *
 * @example
 * ```ts
 * @Post('refresh')
 * refresh(@RefreshToken() refreshToken: RefreshTokenDto) {}
 *
 * @Post('logout')
 * logout(@RefreshToken({ optional: true }) refreshToken: RefreshTokenDto | undefined) {}
 * ```
 */
export const RefreshToken = createParamDecorator(
  (
    options: { optional?: boolean } | undefined,
    ctx: ExecutionContext,
  ): RefreshTokenDto | undefined => {
    const { cookies } = ctx.switchToHttp().getRequest<CookieRequest>();
    const value = cookies?.[REFRESH_COOKIE];
    if (!value && options?.optional) return undefined;

    const parsed = RefreshTokenDtoSchema.safeParse(value);
    if (!parsed.success) throw new InvalidRefreshTokenError();
    return parsed.data;
  },
);
