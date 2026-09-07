/*
 * Copyright (C) 2026-present Aristotelis
 * See repository license for full terms.
 */

const TRANSIENT_CODES = new Set([
  '40001',
  '40P01',
  '55P03',
  '57P01',
  '57P02',
  '57P03',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'ETIMEDOUT',
  'SQLITE_BUSY',
  'SQLITE_LOCKED',
]);

/**
 * Application-facing retry policy for transient technical failures.
 *
 * The policy intentionally depends only on transport-neutral error metadata
 * (`code`, `name`, nested `cause`). It does not import persistence adapters,
 * ORM types, or HTTP/Nest exceptions. Deterministic business/framework errors
 * are therefore not retried unless they explicitly expose a known transient
 * technical code.
 */
export function isTransientTechnicalError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as {
    code?: unknown;
    name?: unknown;
    cause?: unknown;
  };
  const code = typeof candidate.code === 'string' ? candidate.code : '';

  if (
    TRANSIENT_CODES.has(code) ||
    code.startsWith('08') ||
    code.startsWith('53')
  ) {
    return true;
  }

  if (
    candidate.name === 'TaskCancelledError' ||
    candidate.name === 'TimeoutError'
  ) {
    return true;
  }

  return candidate.cause !== undefined
    ? isTransientTechnicalError(candidate.cause)
    : false;
}
