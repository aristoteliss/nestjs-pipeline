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
