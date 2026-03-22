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
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Correlation ID configuration.
 *
 * Controls the HTTP middleware that automatically extracts correlation IDs
 * from incoming requests. For non-HTTP transports (Bull, RabbitMQ, etc.),
 * use {@link runWithCorrelationId} directly in your processor/handler.
 *
 * @example
 * ```ts
 * // Custom header name
 * correlation: { header: 'x-request-id' }
 *
 * // Disable HTTP middleware (worker-only app)
 * correlation: { header: false }
 * ```
 */
export interface CorrelationOptions {
  /**
   * HTTP header name to extract the correlation ID from.
   * Set to `false` to disable the HTTP correlation middleware entirely
   * (e.g. for worker-only apps using Bull / RabbitMQ).
   *
   * @default 'x-correlation-id'
   */
  header?: string | false;
}

/**
 * Injection token for correlation options.
 *
 * Provided by `@nestjs-pipeline/core`'s `PipelineModule.forRoot()` or
 * directly by the consumer when using this package standalone.
 */
export const CORRELATION_OPTIONS = Symbol('CORRELATION_OPTIONS');
