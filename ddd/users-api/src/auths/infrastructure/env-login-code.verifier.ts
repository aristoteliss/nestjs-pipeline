/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ILoginCodeVerifier } from '../application/authentication.ports';
import {
  AuthConfigurationException,
  InvalidLoginCredentialsException,
} from '../domain/errors/authentication.exception';

/**
 * Demo credential adapter for the sample application's login code.
 *
 * Production requires `AUTH_LOGIN_CODE_SHA256`; plaintext `AUTH_LOGIN_CODE` is
 * accepted only outside production for local demo compatibility. Verification
 * always compares fixed-length SHA-256 digests with `timingSafeEqual`.
 */
@Injectable()
export class EnvLoginCodeVerifier implements ILoginCodeVerifier {
  verify(code: string): void {
    const configuredDigest = process.env.AUTH_LOGIN_CODE_SHA256?.trim().toLowerCase();
    const legacyPlaintext = process.env.AUTH_LOGIN_CODE;

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

    const expectedDigest = configuredDigest ?? this.sha256Hex(legacyPlaintext!);
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
