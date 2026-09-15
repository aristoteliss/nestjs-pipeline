/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { UnauthorizedActionException } from '@nestjs-pipeline/casl';

type ErrorResponseBody = {
  statusCode: number;
  error: string;
  message: string;
  action?: string;
  subject?: string;
};

type HttpResponse = {
  status(code: number): HttpResponse;
  json?(body: ErrorResponseBody): unknown;
  send?(body: ErrorResponseBody): unknown;
};

/**
 * Catches {@link UnauthorizedActionException} thrown from domain entities or CQRS handlers
 * and maps it to HTTP 403 Forbidden at the HTTP boundary.
 */
@Catch(UnauthorizedActionException)
export class UnauthorizedActionFilter implements ExceptionFilter {
  catch(exception: UnauthorizedActionException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const body: ErrorResponseBody = {
      statusCode: HttpStatus.FORBIDDEN,
      error: 'Forbidden',
      message: exception.message,
      action: exception.action,
      subject: exception.subject,
    };

    response.status(HttpStatus.FORBIDDEN);
    if (typeof response.json === 'function') {
      response.json(body);
      return;
    }
    response.send?.(body);
  }
}
