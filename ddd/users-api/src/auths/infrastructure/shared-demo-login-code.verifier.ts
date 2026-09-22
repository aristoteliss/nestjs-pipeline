/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ILoginCodeVerifier,
  LoginCredentialVerification,
} from '../application/authentication.ports';
import {
  AuthConfigurationException,
  InvalidLoginCredentialsException,
} from '../domain/errors/authentication.exception';

/**
 * Demo credential adapter: one configured login code is accepted for every
 * user in every tenant, so anyone who knows it can sign in as any existing
 * account. It is not user authentication; a deployment with real users binds
 * `LOGIN_CODE_VERIFIER` to an adapter that ties the credential to the user.
 *
 * In production the shared code is refused unless `AUTH_SHARED_LOGIN_CODE=true`
 * acknowledges it, and only as the `AUTH_LOGIN_CODE_SHA256` digest; plaintext
 * `AUTH_LOGIN_CODE` is accepted only outside production. Verification compares
 * fixed-length SHA-256 digests with `timingSafeEqual`.
 */
@Injectable()
export class SharedDemoLoginCodeVerifier implements ILoginCodeVerifier {
  verify(credentials: LoginCredentialVerification | string): void {
    const code =
      typeof credentials === 'string' ? credentials : credentials.code;
    const configuredDigest =
      process.env.AUTH_LOGIN_CODE_SHA256?.trim().toLowerCase();
    const legacyPlaintext = process.env.AUTH_LOGIN_CODE;

    if (
      process.env.NODE_ENV === 'production' &&
      process.env.AUTH_SHARED_LOGIN_CODE?.trim() !== 'true'
    ) {
      throw new AuthConfigurationException(
        'A shared login code signs in any account; set AUTH_SHARED_LOGIN_CODE=true to accept it in production',
      );
    }

    if (!configuredDigest) {
      if (process.env.NODE_ENV === 'production' && legacyPlaintext) {
        throw new AuthConfigurationException(
          'Plaintext AUTH_LOGIN_CODE is not allowed in production; configure AUTH_LOGIN_CODE_SHA256',
        );
      }
      if (!legacyPlaintext) {
        throw new AuthConfigurationException(
          'AUTH_LOGIN_CODE_SHA256 is not configured',
        );
      }
    }

    const expectedDigest =
      configuredDigest ?? this.sha256Hex(legacyPlaintext ?? '');
    if (!/^[0-9a-f]{64}$/.test(expectedDigest)) {
      throw new AuthConfigurationException(
        'AUTH_LOGIN_CODE_SHA256 must be a 64-character SHA-256 hex digest',
      );
    }

    const actual = Buffer.from(this.sha256Hex(code), 'hex');
    const expected = Buffer.from(expectedDigest, 'hex');
    if (!timingSafeEqual(actual, expected)) {
      throw new InvalidLoginCredentialsException();
    }
  }

  private sha256Hex(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }
}
