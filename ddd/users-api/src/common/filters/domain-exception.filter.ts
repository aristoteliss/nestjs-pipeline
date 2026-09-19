/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import {
  ConcurrencyConflictError,
  DomainException,
  EntityNotFoundException,
} from '@nestjs-pipeline/ddd-core';
import {
  AuthConfigurationException,
  InvalidLoginCredentialsException,
} from '../../auths/domain/errors/authentication.exception';
import {
  InvalidRoleNameException,
  UniqueRoleNameException,
} from '../../roles/domain/models/errors/role-name.exception';
import {
  EmptyUserUpdateException,
  InvalidDepartmentException,
  InvalidUsernameException,
  UniqueEmailException,
} from '../../users/domain/models/errors';

type ErrorResponseBody = {
  statusCode: number;
  error: string;
  message: string;
  [key: string]: unknown;
};

type HttpResponse = {
  status(code: number): HttpResponse;
  json?(body: ErrorResponseBody): unknown;
  send?(body: ErrorResponseBody): unknown;
};

/**
 * API-layer mapper from framework-neutral domain/application failures to HTTP.
 *
 * | Domain/Application Exception | HTTP Status | Reason |
 * |---|---|---|
 * | {@link ConcurrencyConflictError} | 409 Conflict | A version-conditioned write lost a race |
 * | {@link EntityNotFoundException} | 404 Not Found | Required aggregate/entity does not exist |
 * | {@link UniqueEmailException} | 409 Conflict | Duplicate email detected across tenant users |
 * | {@link UniqueRoleNameException} | 409 Conflict | Duplicate role name detected across tenant roles |
 * | {@link InvalidRoleNameException} | 422 Unprocessable Entity | Invalid role name |
 * | {@link InvalidUsernameException} | 422 Unprocessable Entity | Invalid username |
 * | {@link InvalidDepartmentException} | 422 Unprocessable Entity | Invalid department |
 * | {@link EmptyUserUpdateException} | 400 Bad Request | No mutable fields supplied |
 * | Unclassified {@link DomainException} | 400 Bad Request | Generic invariant failure |
 *
 * Application and persistence code must not throw Nest HTTP exceptions to obtain
 * these responses; this filter is the presentation boundary responsible for mapping.
 *
 * @example Registering globally in bootstrap:
 * ```typescript
 * const app = await NestFactory.create(AppModule);
 * app.useGlobalFilters(new DomainExceptionFilter());
 * ```
 *
 * @example Sample 422 Unprocessable Entity payload:
 * ```json
 * {
 *   "statusCode": 422,
 *   "error": "Unprocessable Entity",
 *   "message": "Username must be at least 3 characters, received: \"a\".",
 *   "minLength": 3,
 *   "actualValue": "a"
 * }
 * ```
 */
@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const { statusCode, error, extra } = this.resolveHttpError(exception);

    const body: ErrorResponseBody = {
      statusCode,
      error,
      message: exception.message,
      ...extra,
    };

    response.status(statusCode);
    if (typeof response.json === 'function') {
      response.json(body);
      return;
    }
    response.send?.(body);
  }

  private resolveHttpError(exception: DomainException): {
    statusCode: number;
    error: string;
    extra?: Record<string, unknown>;
  } {
    if (exception instanceof ConcurrencyConflictError) {
      return { statusCode: HttpStatus.CONFLICT, error: 'Conflict' };
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

    if (exception instanceof EntityNotFoundException) {
      return { statusCode: HttpStatus.NOT_FOUND, error: 'Not Found' };
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
        extra: {
          minLength: exception.minLength,
          actualValue: exception.actualValue,
        },
      };
    }

    if (exception instanceof EmptyUserUpdateException) {
      return { statusCode: HttpStatus.BAD_REQUEST, error: 'Bad Request' };
    }

    return { statusCode: HttpStatus.BAD_REQUEST, error: 'Bad Request' };
  }
}
