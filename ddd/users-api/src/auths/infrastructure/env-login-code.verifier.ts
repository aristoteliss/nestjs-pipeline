/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { Injectable } from '@nestjs/common';
import type { ILoginCodeVerifier } from '../application/authentication.ports';
import {
  AuthConfigurationException,
  InvalidLoginCredentialsException,
} from '../domain/errors/authentication.exception';

/** Demo adapter for the sample application's environment-backed login code. */
@Injectable()
export class EnvLoginCodeVerifier implements ILoginCodeVerifier {
  verify(code: string): void {
    const expectedCode = process.env.AUTH_LOGIN_CODE;
    if (!expectedCode) {
      throw new AuthConfigurationException('AUTH_LOGIN_CODE is not configured');
    }
    if (code !== expectedCode) {
      throw new InvalidLoginCredentialsException();
    }
  }
}
