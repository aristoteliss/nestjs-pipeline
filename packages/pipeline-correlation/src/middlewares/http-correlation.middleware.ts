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

import { IncomingMessage, ServerResponse } from 'node:http';
import { Inject, Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { DEFAULT_CORRELATION_HEADER } from '../constants/correlation.constants';
import { correlationStore, getCorrelationId } from '../correlation.store';
import {
  CORRELATION_OPTIONS,
  CorrelationOptions,
} from '../options/correlation.options';

const HTTP_FIELD_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * NestJS middleware that extracts a correlation ID from the incoming HTTP
 * request header and stores it in {@link correlationStore} for the remainder of
 * the request callback.
 *
 * The header name defaults to `x-correlation-id`. Applications that need a
 * different header can bind {@link CORRELATION_OPTIONS} with a string `header`.
 * The middleware itself must be registered explicitly with Nest's
 * `MiddlewareConsumer`; it is not installed by `PipelineModule`.
 *
 * If `header` is omitted or is any non-string value (including `false`), the
 * current implementation uses the default `x-correlation-id` header. A false
 * value does not disable a middleware instance that the application registered.
 */
@Injectable()
export class HttpCorrelationMiddleware implements NestMiddleware {
  private readonly header: string;

  constructor(
    @Optional()
    @Inject(CORRELATION_OPTIONS)
    options?: CorrelationOptions,
  ) {
    const h = options?.header;
    if (typeof h === 'string' && !HTTP_FIELD_NAME.test(h)) {
      throw new TypeError(`Invalid correlation HTTP header name: "${h}".`);
    }
    this.header =
      typeof h === 'string' ? h.toLowerCase() : DEFAULT_CORRELATION_HEADER;
  }

  use(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    const raw = req.headers?.[this.header];
    const correlationId =
      (Array.isArray(raw) ? raw[0] : raw) || getCorrelationId();

    if (typeof res?.setHeader === 'function') {
      res.setHeader(this.header, correlationId);
    }

    correlationStore.run(correlationId, next);
  }
}
