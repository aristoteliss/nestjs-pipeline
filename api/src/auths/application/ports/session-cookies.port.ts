/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { AuthResult } from '../results/auth.result';

export const SESSION_COOKIES = Symbol('SESSION_COOKIES');

/** Writes the session cookies of the HTTP request a command runs in; outside an HTTP request it does nothing. */
export interface ISessionCookies {
  save(result: AuthResult): void;
  clear(): void;
}
