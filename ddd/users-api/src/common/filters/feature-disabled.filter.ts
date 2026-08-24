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
import { FeatureDisabledError } from '@nestjs-pipeline/feature-flags';

type ErrorResponseBody = {
  statusCode: number;
  error: string;
  message: string;
  flag: string;
};

type HttpResponse = {
  status(code: number): { json(body: ErrorResponseBody): void };
};

/**
 * Catches {@link FeatureDisabledError} thrown by `FeatureFlagBehavior` at the
 * pipeline boundary and maps it to HTTP 403 Forbidden. Adjust the status to 404
 * if you prefer to hide gated features entirely.
 */
@Catch(FeatureDisabledError)
export class FeatureDisabledFilter implements ExceptionFilter {
  catch(exception: FeatureDisabledError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();

    response.status(HttpStatus.FORBIDDEN).json({
      statusCode: HttpStatus.FORBIDDEN,
      error: 'Forbidden',
      message: exception.message,
      flag: exception.flag,
    });
  }
}
