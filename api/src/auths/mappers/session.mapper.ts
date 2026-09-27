/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { InternalServerErrorException } from '@nestjs/common';
import type { AuthResult } from '../application/results/auth.result';
import {
  type SessionResponse,
  SessionResponseSchema,
} from '../dtos/sessionResponse.dto';

/**
 * Maps a login or refresh result to the response body through
 * {@link SessionResponseSchema}, which keeps only the fields it lists: the
 * refresh token and the session aggregate never reach the body. A missing
 * department becomes `null`.
 *
 * @param result - Result of `CreateAuthCommand` or `RefreshAuthCommand`.
 * @returns The body of `POST /auths/login` and `POST /auths/refresh`.
 * @throws InternalServerErrorException when the result does not fit the schema.
 *
 * @example
 * ```ts
 * this.sessionService.save(session, res, result);
 * return toSessionRes(result);
 * ```
 */
export function toSessionRes(result: AuthResult): SessionResponse {
  const parsed = SessionResponseSchema.safeParse({
    ...result,
    id: result.userId,
    department: result.department ?? null,
  });
  if (!parsed.success) {
    throw new InternalServerErrorException('Response mapping failed');
  }
  return parsed.data;
}
