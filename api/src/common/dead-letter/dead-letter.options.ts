/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  ConcurrencyConflictError,
  EntityNotFoundException,
} from '@cqrs-ddd/core/domain';
import { UnauthorizedActionException } from '@cqrs-ddd/pipeline-casl';
import type { DeadLetterBehaviorOptions } from '@cqrs-ddd/pipeline-deadletter';
import { FeatureDisabledError } from '@cqrs-ddd/pipeline-feature-flags';
import {
  IdempotencyCompletionError,
  IdempotencyConflictError,
} from '@cqrs-ddd/pipeline-idempotency';
import { RateLimitExceededError } from '@cqrs-ddd/pipeline-rate-limit';
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { InvalidLoginCredentialsException } from '../../auths/domain/errors/authentication.exception.js';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from '../../auths/domain/errors/refresh-token.errors.js';
import {
  InvalidRoleNameException,
  UniqueRoleNameException,
} from '../../roles/domain/models/errors/role-name.exception.js';
import {
  EmptyUserUpdateException,
  InvalidDepartmentException,
  InvalidUsernameException,
  UniqueEmailException,
} from '../../users/domain/models/errors/index.js';

/**
 * Rejections the application raises as an ordinary answer to the caller. Replaying
 * the request cannot change the outcome, so none of them is dead-lettered.
 *
 * Listed by concrete class, because a listed class also covers its subclasses:
 * listing `DomainException` would also hide misconfigurations such as
 * `AuthConfigurationException`. `dead-letter.options.spec.ts` fails for any
 * application or core domain error class that is neither listed here nor
 * declared there as dead-lettered.
 */
const EXPECTED_REJECTIONS = [
  ZodValidationError,
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
const POST_SUCCESS_FAILURES = [IdempotencyCompletionError] as const;

/**
 * Module-wide `DeadLetterBehavior` defaults for this application: commands and
 * events are captured; `ObservabilityModule` registers the behavior for exactly
 * those kinds.
 */
export const DEAD_LETTER_DEFAULTS: DeadLetterBehaviorOptions = {
  captureKinds: ['command', 'event'],
  ignoreErrors: [...EXPECTED_REJECTIONS, ...POST_SUCCESS_FAILURES],
  redactKeys: ['code'],
};
