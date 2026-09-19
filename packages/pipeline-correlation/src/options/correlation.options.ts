/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Correlation ID configuration consumed by {@link HttpCorrelationMiddleware}.
 *
 * The middleware is registered explicitly by the application. For non-HTTP
 * transports (Bull, RabbitMQ, etc.), use `runWithCorrelationId()` directly in
 * your processor/handler.
 *
 * Incoming-ID hardening is opt-in. By default a non-empty incoming header value
 * is accepted and echoed unchanged.
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
 *
 * @example Harden untrusted public HTTP input without forcing UUID format
 * ```ts
 * {
 *   maxLength: 128,
 *   trimIncoming: true,
 *   validateIncoming: (id) => /^[A-Za-z0-9._~:/+-]+$/.test(id),
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
   * `undefined`, makes the current middleware implementation use the default
   * `x-correlation-id` header.
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
   * Optional maximum accepted incoming correlation-ID length. Values longer
   * than this are discarded and replaced by the locally resolved/generated ID.
   * When omitted, no new length restriction is applied.
   *
   * @example
   * ```ts
   * { maxLength: 128 }
   * ```
   */
  maxLength?: number;

  /**
   * Optional application-specific validation predicate for incoming IDs.
   * Returning `false` (or throwing) rejects the incoming value and falls back to
   * the local correlation ID. No built-in UUID/character-format restriction is
   * imposed, so W3C/custom identifiers remain usable.
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
