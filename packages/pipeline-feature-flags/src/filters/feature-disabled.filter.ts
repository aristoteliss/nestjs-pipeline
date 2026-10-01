/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Inject,
  Optional,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { FeatureDisabledError } from '../errors/feature-disabled.error.js';

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
 * `{ status: 404 }` for applications that hide gated features entirely. It
 * replies through Nest's HTTP adapter, so it works on Express and Fastify, also
 * for errors thrown in middleware.
 *
 * The options parameter is optional to Nest's injector, so
 * `{ provide: APP_FILTER, useClass: FeatureDisabledFilter }` gets the defaults.
 *
 * @example Register it globally with the defaults, or hiding gated features
 * ```ts
 * @Module({ providers: [{ provide: APP_FILTER, useClass: FeatureDisabledFilter }] })
 * export class AppModule {}
 *
 * {
 *   provide: APP_FILTER,
 *   inject: [HttpAdapterHost],
 *   useFactory: (adapterHost: HttpAdapterHost) =>
 *     new FeatureDisabledFilter(adapterHost, { status: 404 }),
 * }
 * ```
 */
@Catch(FeatureDisabledError)
export class FeatureDisabledFilter implements ExceptionFilter {
  private readonly hideFeature: boolean;

  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Optional() options?: FeatureDisabledFilterOptions,
  ) {
    this.hideFeature = options?.status === 404;
  }

  catch(exception: FeatureDisabledError, host: ArgumentsHost): void {
    const body = this.hideFeature
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
    this.adapterHost.httpAdapter.reply(
      host.switchToHttp().getResponse(),
      body,
      body.statusCode,
    );
  }
}
