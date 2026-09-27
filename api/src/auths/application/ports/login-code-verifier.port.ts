/* Copyright (C) 2026-present Aristotelis — see repository license. */

export const LOGIN_CODE_VERIFIER = Symbol('LOGIN_CODE_VERIFIER');

export interface LoginCredentialVerification {
  userId: string;
  code: string;
}

/**
 * Checks the login code a caller presents for an already resolved user. Bind a
 * per-user adapter in a real deployment; the sample binds a shared demo code.
 * A wrong code throws `InvalidLoginCredentialsException` (answered as 401).
 */
export interface ILoginCodeVerifier {
  verify(credentials: LoginCredentialVerification): Promise<void> | void;
}
