/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * HTTP status mapping for this package's errors.
 *
 * It returns plain numbers and strings and loads no HTTP framework, so an
 * application's own error handler or exception filter decides how to send it.
 * HTTP stays out of `/domain` and `/application`.
 */

export * from './domain-error-http-status';
