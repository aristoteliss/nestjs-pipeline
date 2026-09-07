/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { DomainException } from '@nestjs-pipeline/ddd-core';

/** Authentication failed without exposing which credential component was wrong. */
export class InvalidLoginCredentialsException extends DomainException {
  constructor() {
    super('Invalid credentials');
  }
}

/** Required server-side authentication/token configuration is invalid or absent. */
export class AuthConfigurationException extends DomainException {
  constructor(message: string) {
    super(message);
  }
}
