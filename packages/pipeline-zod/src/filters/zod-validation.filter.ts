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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
 */
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { ZodValidationError } from '../errors/zod-validation.error';

type ErrorResponseBody = {
  statusCode: number;
  error: string;
  message: string;
  details: ZodValidationError['details'];
};

type HttpResponse = { status(code: number): { json(body: ErrorResponseBody): void } };

/**
 * Catches {@link ZodValidationError} thrown by both `createRequest()` constructors
 * and {@link ZodValidationBehavior} at the pipeline boundary, mapping them to HTTP 400.
 */
@Catch(ZodValidationError)
export class ZodValidationFilter implements ExceptionFilter {
  catch(exception: ZodValidationError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponse>();

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: exception.message,
      details: exception.details,
    });
  }
}
