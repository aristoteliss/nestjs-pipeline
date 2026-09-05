/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { DomainException } from '@nestjs-pipeline/ddd-core';
import { UniqueRoleNameException } from '../../roles/domain/models/errors/role-name.exception';
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
 * Global API-layer exception filter that catches framework-agnostic {@link DomainException}s
 * thrown from the domain layer and translates them into standard HTTP error responses:
 *
 * - {@link UniqueEmailException} & {@link UniqueRoleNameException} &rarr; 409 Conflict
 * - {@link InvalidUsernameException} & {@link InvalidDepartmentException} &rarr; 422 Unprocessable Entity
 * - {@link EmptyUserUpdateException} & unclassified {@link DomainException} &rarr; 400 Bad Request
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
    if (
      exception instanceof UniqueEmailException ||
      exception instanceof UniqueRoleNameException
    ) {
      return {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
      };
    }

    if (
      exception instanceof InvalidUsernameException ||
      exception instanceof InvalidDepartmentException
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
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
      };
    }

    return {
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
    };
  }
}
