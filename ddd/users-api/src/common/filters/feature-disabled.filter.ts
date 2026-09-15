/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
  status(code: number): HttpResponse;
  json?(body: ErrorResponseBody): unknown;
  send?(body: ErrorResponseBody): unknown;
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
    const body: ErrorResponseBody = {
      statusCode: HttpStatus.FORBIDDEN,
      error: 'Forbidden',
      message: exception.message,
      flag: exception.flag,
    };

    response.status(HttpStatus.FORBIDDEN);
    if (typeof response.json === 'function') {
      response.json(body);
      return;
    }
    response.send?.(body);
  }
}
