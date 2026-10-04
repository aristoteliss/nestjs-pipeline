/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type {
  ConcurrencyConflictError,
  EntityNotFoundException,
  MissingTenantContextError,
} from '@cqrs-ddd/core/domain';
import { DomainException } from '@cqrs-ddd/core/domain';
import { domainErrorHttpStatus } from '@cqrs-ddd/core/http';
import { ErrorFilter } from '@cqrs-ddd/nestjs';
import {
  type ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  AuthConfigurationException,
  InvalidLoginCredentialsException,
} from '../../auths/domain/errors/authentication.exception.js';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from '../../auths/domain/errors/refresh-token.errors.js';
import {
  InvalidRoleNameException,
  UniqueRoleNameException,
} from '../../roles/domain/models/errors/role-name.exception.js';
import {
  InvalidDepartmentException,
  InvalidUsernameException,
  UniqueEmailException,
} from '../../users/domain/models/errors/index.js';

/**
 * API-layer mapper from framework-neutral domain/application failures to HTTP.
 *
 * | Domain/Application Exception | HTTP Status | Reason |
 * |---|---|---|
 * | {@link ConcurrencyConflictError} | 409 Conflict | A version-conditioned write lost a race |
 * | {@link InvalidRefreshTokenError} | 401 Unauthorized, `code: refresh_invalid` | Unknown, expired or revoked refresh token |
 * | {@link RefreshTokenReuseError} | 401 Unauthorized, `code: refresh_reused` | A rotated-away refresh token was presented; the session is revoked |
 * | {@link EntityNotFoundException} | 404 Not Found | Required aggregate/entity does not exist |
 * | {@link MissingTenantContextError} | 500, generic message | Server misconfiguration: every request path must carry a tenant, and invalid tenant headers are already rejected |
 * | {@link UniqueEmailException} | 409 Conflict | Duplicate email detected across tenant users |
 * | {@link UniqueRoleNameException} | 409 Conflict | Duplicate role name detected across tenant roles |
 * | {@link InvalidRoleNameException} | 422 Unprocessable Entity, with the violation's `field`, `rule` and `limit` | Invalid role name |
 * | {@link InvalidUsernameException} | 422 Unprocessable Entity, likewise | Invalid username |
 * | {@link InvalidDepartmentException} | 422 Unprocessable Entity, likewise | Invalid department |
 * | `EmptyUserUpdateException` | 400 Bad Request | No mutable fields supplied |
 * | Unclassified {@link DomainException} | 400 Bad Request | Generic invariant failure |
 *
 * The `ddd-core` rows (conflict, not found, missing tenant, unclassified) come
 * from `domainErrorHttpStatus()`; this filter maps the application's own
 * exceptions first and passes the rest to it.
 *
 * Application and persistence code must not throw Nest HTTP exceptions to obtain
 * these responses; this filter is the presentation boundary responsible for mapping.
 * It is the application's one global filter: it turns a domain exception into
 * the matching NestJS `HttpException`, and leaves everything else to
 * `ErrorFilter` of `@cqrs-ddd/nestjs`, which converts the other package errors
 * and answers through Nest's own exception handling, on Express and Fastify,
 * also for errors thrown in middleware.
 *
 * @example Registering globally, so Nest injects the adapter host:
 * ```typescript
 * @Module({ providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }] })
 * export class AppModule {}
 * ```
 *
 * @example Sample 422 Unprocessable Entity payload:
 * ```json
 * {
 *   "statusCode": 422,
 *   "error": "Unprocessable Entity",
 *   "message": "username must be at least 3 characters.",
 *   "field": "username",
 *   "rule": "minLength",
 *   "limit": 3
 * }
 * ```
 */
@Catch()
export class DomainExceptionFilter extends ErrorFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(
      exception instanceof DomainException
        ? this.toHttpException(exception)
        : exception,
      host,
    );
  }

  private toHttpException(exception: DomainException): HttpException {
    const { statusCode, error, message, extra } =
      this.resolveHttpError(exception);
    return new HttpException(
      { statusCode, message: message ?? exception.message, error, ...extra },
      statusCode,
    );
  }

  private resolveHttpError(exception: DomainException): {
    statusCode: number;
    error: string;
    message?: string;
    extra?: Record<string, unknown>;
  } {
    if (
      exception instanceof InvalidRefreshTokenError ||
      exception instanceof RefreshTokenReuseError
    ) {
      return {
        statusCode: HttpStatus.UNAUTHORIZED,
        error: 'Unauthorized',
        extra: { code: exception.code },
      };
    }

    if (exception instanceof InvalidLoginCredentialsException) {
      return { statusCode: HttpStatus.UNAUTHORIZED, error: 'Unauthorized' };
    }

    if (exception instanceof AuthConfigurationException) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
      };
    }

    if (
      exception instanceof UniqueEmailException ||
      exception instanceof UniqueRoleNameException
    ) {
      return { statusCode: HttpStatus.CONFLICT, error: 'Conflict' };
    }

    if (
      exception instanceof InvalidUsernameException ||
      exception instanceof InvalidDepartmentException ||
      exception instanceof InvalidRoleNameException
    ) {
      return {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        extra: { ...exception.violation },
      };
    }

    return domainErrorHttpStatus(exception);
  }
}
