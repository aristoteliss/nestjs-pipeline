/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { UnauthorizedException } from '@nestjs/common';
import { UnauthorizedActionException } from '@nestjs-pipeline/casl';
import {
  ConcurrencyConflictError,
  EntityNotFoundException,
} from '@nestjs-pipeline/ddd-core/domain';
import type { DeadLetterBehaviorOptions } from '@nestjs-pipeline/deadletter';
import { FeatureDisabledError } from '@nestjs-pipeline/feature-flags';
import {
  IdempotencyCompletionError,
  IdempotencyConflictError,
} from '@nestjs-pipeline/idempotency';
import { RateLimitExceededError } from '@nestjs-pipeline/rate-limit';
import { ZodValidationError } from '@nestjs-pipeline/zod';
import { InvalidLoginCredentialsException } from '../auths/domain/errors/authentication.exception';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from '../auths/domain/errors/refresh-token.errors';
import {
  InvalidRoleNameException,
  UniqueRoleNameException,
} from '../roles/domain/models/errors/role-name.exception';
import {
  EmptyUserUpdateException,
  InvalidDepartmentException,
  InvalidUsernameException,
  UniqueEmailException,
} from '../users/domain/models/errors';

/**
 * Rejections the application raises as an ordinary answer to the caller. Replaying
 * the request cannot change the outcome, so none of them is dead-lettered.
 *
 * Listed by concrete class: a `DomainException` subclass that signals a broken
 * invariant or misconfiguration (`AuthConfigurationException`,
 * `MissingTenantContextError`) stays capturable.
 */
export const EXPECTED_REJECTIONS = [
  ZodValidationError,
  UnauthorizedException,
  UnauthorizedActionException,
  InvalidLoginCredentialsException,
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
  EntityNotFoundException,
  ConcurrencyConflictError,
  UniqueEmailException,
  UniqueRoleNameException,
  EmptyUserUpdateException,
  InvalidUsernameException,
  InvalidDepartmentException,
  InvalidRoleNameException,
  FeatureDisabledError,
  RateLimitExceededError,
  IdempotencyConflictError,
] as const;

/**
 * Failures raised after the handler has already committed its side effects.
 * Replaying them from the dead-letter queue would execute the command twice, so
 * they are left to logging and metrics instead.
 */
export const POST_SUCCESS_FAILURES = [IdempotencyCompletionError] as const;

/** Module-wide `DeadLetterBehavior` defaults for this application. */
export const DEAD_LETTER_DEFAULTS: DeadLetterBehaviorOptions = {
  captureKinds: ['command', 'event'],
  ignoreErrors: [...EXPECTED_REJECTIONS, ...POST_SUCCESS_FAILURES],
  redactKeys: ['code'],
};
