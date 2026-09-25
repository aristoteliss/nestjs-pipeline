/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { FeatureDisabledError } from '../errors/feature-disabled.error';

type ErrorResponseBody = {
  statusCode: number;
  error: string;
  message: string;
  flag?: string;
};

type HttpResponse = {
  status(code: number): HttpResponse;
  json?(body: ErrorResponseBody): unknown;
  send?(body: ErrorResponseBody): unknown;
};

/** Options for {@link FeatureDisabledFilter}. */
export interface FeatureDisabledFilterOptions {
  /**
   * `403` answers Forbidden and names the flag, telling the caller that the
   * feature exists and is off for them. `404` hides the feature: the response is
   * a plain Not Found that carries neither the flag nor the error message.
   *
   * @default 403
   */
  readonly status?: 403 | 404;
}

/**
 * Catches {@link FeatureDisabledError} thrown by `FeatureFlagBehavior` at the
 * pipeline boundary and maps it to HTTP 403 Forbidden, or to 404 Not Found with
 * `{ status: 404 }` for applications that hide gated features entirely. Works
 * with both Express and Fastify responses.
 *
 * Register it globally:
 * ```ts
 * app.useGlobalFilters(new FeatureDisabledFilter());
 * app.useGlobalFilters(new FeatureDisabledFilter({ status: 404 }));
 * ```
 *
 * The options parameter is optional to Nest's injector too, so
 * `{ provide: APP_FILTER, useClass: FeatureDisabledFilter }` gets the defaults.
 */
@Catch(FeatureDisabledError)
export class FeatureDisabledFilter implements ExceptionFilter {
  private readonly hideFeature: boolean;

  constructor(@Optional() options?: FeatureDisabledFilterOptions) {
    this.hideFeature = options?.status === 404;
  }

  catch(exception: FeatureDisabledError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const body: ErrorResponseBody = this.hideFeature
      ? {
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: 'Not Found',
        }
      : {
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
          message: exception.message,
          flag: exception.flag,
        };

    response.status(body.statusCode);
    if (typeof response.json === 'function') {
      response.json(body);
      return;
    }
    response.send?.(body);
  }
}
