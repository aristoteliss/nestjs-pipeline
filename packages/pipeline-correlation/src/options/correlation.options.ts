/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Default upper bound for an accepted incoming correlation ID. */
export const DEFAULT_CORRELATION_ID_MAX_LENGTH = 128;

/**
 * Characters accepted in an incoming correlation ID unless `validateIncoming`
 * is configured: letters, digits and `. _ ~ : / + = @ -`, which covers UUIDs,
 * W3C trace identifiers and common request-ID formats.
 */
export const DEFAULT_CORRELATION_ID_PATTERN = /^[A-Za-z0-9._~:/+=@-]+$/;

/**
 * Correlation ID configuration consumed by {@link HttpCorrelationMiddleware}.
 *
 * The middleware is registered explicitly by the application. For non-HTTP
 * transports (Bull, RabbitMQ, etc.), use `runWithCorrelationId()` directly in
 * your processor/handler.
 *
 * An incoming header value is accepted only when it is at most
 * {@link DEFAULT_CORRELATION_ID_MAX_LENGTH} characters and matches
 * {@link DEFAULT_CORRELATION_ID_PATTERN}; otherwise a local ID is used.
 * `maxLength` and `validateIncoming` replace these defaults.
 *
 * @example
 * ```ts
 * // Custom header name (bind CORRELATION_OPTIONS to this value)
 * { header: 'x-request-id' }
 *
 * // `header: false` selects the default header; it does not disable the middleware.
 * { header: false } // uses 'x-correlation-id'
 * ```
 *
 * @example Accept only UUIDs from clients
 * ```ts
 * {
 *   maxLength: 36,
 *   trimIncoming: true,
 *   validateIncoming: (id) => /^[0-9a-f-]{36}$/i.test(id),
 * }
 * ```
 *
 * @example Ignore client IDs completely and always generate/use the local ID
 * ```ts
 * { acceptIncoming: false }
 * ```
 */
export interface CorrelationOptions {
  /**
   * HTTP header name to extract the correlation ID from.
   * A valid, non-empty HTTP field-name string selects that header. Invalid
   * strings throw during middleware construction. Any non-string value, including `false` and
   * `undefined`, makes the middleware use the default `x-correlation-id` header.
   *
   * @default 'x-correlation-id'
   */
  header?: string | false;

  /**
   * Whether a non-empty incoming correlation ID may be used.
   * Set to `false` when correlation IDs are internal-only and should never be
   * controlled by the HTTP client.
   *
   * @default true
   */
  acceptIncoming?: boolean;

  /**
   * Trim surrounding whitespace before optional length/custom validation and
   * before storing/echoing the ID.
   *
   * @default false
   */
  trimIncoming?: boolean;

  /**
   * Maximum accepted incoming correlation-ID length. Longer values are
   * discarded and replaced by the locally resolved/generated ID.
   *
   * @default 128
   */
  maxLength?: number;

  /**
   * Validation predicate for incoming IDs; replaces the default
   * {@link DEFAULT_CORRELATION_ID_PATTERN} check. Returning `false` (or
   * throwing) rejects the incoming value and falls back to the local
   * correlation ID. `maxLength` still applies.
   *
   * @example
   * ```ts
   * {
   *   validateIncoming: (id) => /^[A-Za-z0-9._-]+$/.test(id),
   * }
   * ```
   */
  validateIncoming?: (correlationId: string) => boolean;
}

/**
 * Injection token for optional correlation middleware configuration.
 * Consumers that want a custom header bind this token themselves.
 */
export const CORRELATION_OPTIONS = Symbol('CORRELATION_OPTIONS');
