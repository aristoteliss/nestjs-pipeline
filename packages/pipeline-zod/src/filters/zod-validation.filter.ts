/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { ZodValidationError } from '../errors/zod-validation.error';

type ErrorResponseBody = {
  statusCode: number;
  error: string;
  message: string;
  details: ZodValidationError['details'];
};

type HttpResponse = {
  status(code: number): HttpResponse;
  json?(body: ErrorResponseBody): unknown;
  send?(body: ErrorResponseBody): unknown;
};

/**
 * Catches {@link ZodValidationError} thrown by `createCommand()`, `createQuery()`,
 * or `createZodRequest()` constructors and {@link ZodValidationBehavior} at the pipeline boundary, mapping them to HTTP 400.
 */
@Catch(ZodValidationError)
export class ZodValidationFilter implements ExceptionFilter {
  catch(exception: ZodValidationError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponse>();
    const body: ErrorResponseBody = {
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: exception.message,
      details: exception.details,
    };

    response.status(HttpStatus.BAD_REQUEST);
    if (typeof response.json === 'function') {
      response.json(body);
      return;
    }
    response.send?.(body);
  }
}
