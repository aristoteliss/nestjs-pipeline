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

/**
 * Correlation ID configuration consumed by {@link HttpCorrelationMiddleware}.
 *
 * The middleware is registered explicitly by the application. For non-HTTP
 * transports (Bull, RabbitMQ, etc.), use `runWithCorrelationId()` directly in
 * your processor/handler.
 *
 * @example
 * ```ts
 * // Custom header name (bind CORRELATION_OPTIONS to this value)
 * { header: 'x-request-id' }
 *
 * // `false` is accepted by the public type for compatibility, but the current
 * // middleware treats every non-string value as the default header name.
 * { header: false } // uses 'x-correlation-id'; it does not disable middleware
 * ```
 */
export interface CorrelationOptions {
  /**
   * HTTP header name to extract the correlation ID from.
   * A valid, non-empty HTTP field-name string selects that header. Invalid
   * strings throw during middleware construction. Any non-string value, including `false` and
   * `undefined`, makes the current middleware implementation use the default
   * `x-correlation-id` header.
   *
   * @default 'x-correlation-id'
   */
  header?: string | false;
}

/**
 * Injection token for optional correlation middleware configuration.
 * Consumers that want a custom header bind this token themselves.
 */
export const CORRELATION_OPTIONS = Symbol('CORRELATION_OPTIONS');
