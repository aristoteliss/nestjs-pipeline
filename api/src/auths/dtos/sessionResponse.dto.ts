/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  isPrincipalType,
  type PrincipalType,
} from '@common/types/session-principal';
import { z } from 'zod';

/**
 * Response of `POST /auths/login` and `POST /auths/refresh`. Parsing through it
 * keeps only the fields it lists, so the refresh token never reaches the body;
 * it travels only in the `HttpOnly` `refresh_token` cookie.
 * `accessTokenExpiresAt` is a Unix timestamp in milliseconds.
 *
 * @example
 * `{ "id": "019...", "principalType": "user", "tenant": "acme", "email": "user@example.com", "department": null, "accessToken": "eyJ...", "accessTokenExpiresAt": 1741258800000 }`
 */
export const SessionResponseSchema = z.object({
  id: z.string(),
  principalType: z.custom<PrincipalType>(isPrincipalType),
  tenant: z.string(),
  email: z.string(),
  department: z.string().nullable(),
  accessToken: z.string(),
  accessTokenExpiresAt: z.number(),
});

export type SessionResponse = z.output<typeof SessionResponseSchema>;
