/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
 *
 * Incoming-ID hardening is opt-in. Public-facing applications can set
 * `acceptIncoming`, `trimIncoming`, `maxLength`, and/or `validateIncoming`
 * without imposing a package-wide UUID format.
 *
 * @example Register for all HTTP routes
 * ```ts
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
 *   }
 * }
 * ```
 *
 * @example Reject oversized/untrusted client IDs
 * ```ts
 * {
 *   provide: CORRELATION_OPTIONS,
 *   useValue: {
 *     maxLength: 128,
 *     trimIncoming: true,
 *     validateIncoming: (id: string) => /^[A-Za-z0-9._~:/+-]+$/.test(id),
 *   },
 * }
 * ```
 */
@Injectable()
export class HttpCorrelationMiddleware implements NestMiddleware {
  private readonly header: string;
  private readonly acceptIncoming: boolean;
  private readonly trimIncoming: boolean;
  private readonly maxLength?: number;
  private readonly validateIncoming?: (correlationId: string) => boolean;

  constructor(
    @Optional()
    @Inject(CORRELATION_OPTIONS)
    options?: CorrelationOptions,
  ) {
    const h = options?.header;
    if (typeof h === 'string' && !HTTP_FIELD_NAME.test(h)) {
      throw new TypeError(`Invalid correlation HTTP header name: "${h}".`);
    }

    if (
      options?.maxLength !== undefined &&
      (!Number.isSafeInteger(options.maxLength) || options.maxLength <= 0)
    ) {
      throw new TypeError(
        'Correlation maxLength must be a positive safe integer when provided.',
      );
    }

    this.header =
      typeof h === 'string' ? h.toLowerCase() : DEFAULT_CORRELATION_HEADER;
    this.acceptIncoming = options?.acceptIncoming ?? true;
    this.trimIncoming = options?.trimIncoming ?? false;
    this.maxLength = options?.maxLength;
    this.validateIncoming = options?.validateIncoming;
  }

  use(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    const raw = req.headers?.[this.header];
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    const correlationId = this.resolveIncoming(candidate) ?? getCorrelationId();

    if (typeof res?.setHeader === 'function') {
      res.setHeader(this.header, correlationId);
    }

    correlationStore.run(correlationId, next);
  }

  /** Applies configured validation/normalization to one incoming header value. */
  private resolveIncoming(raw: string | undefined): string | undefined {
    if (!this.acceptIncoming || typeof raw !== 'string' || raw.length === 0) {
      return undefined;
    }

    const value = this.trimIncoming ? raw.trim() : raw;
    if (value.length === 0) return undefined;

    if (this.maxLength !== undefined && value.length > this.maxLength) {
      return undefined;
    }

    if (this.validateIncoming) {
      try {
        if (!this.validateIncoming(value)) return undefined;
      } catch {
        return undefined;
      }
    }

    return value;
  }
}
