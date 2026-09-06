/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { HttpException } from '@nestjs/common';

const TRANSIENT_CODES = new Set([
  '40001', // PostgreSQL serialization failure
  '40P01', // PostgreSQL deadlock
  '55P03', // PostgreSQL lock not available
  '57P01', // PostgreSQL admin shutdown
  '57P02', // PostgreSQL crash shutdown
  '57P03', // PostgreSQL cannot connect now
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'ETIMEDOUT',
  'SQLITE_BUSY',
  'SQLITE_LOCKED',
]);

/** True only for persistence/network failures that are reasonable to retry. */
export function isTransientPersistenceError(error: unknown): boolean {
  if (error instanceof HttpException) return false;
  if (!error || typeof error !== 'object') return false;

  const candidate = error as {
    code?: unknown;
    name?: unknown;
    cause?: unknown;
  };
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  if (
    TRANSIENT_CODES.has(code) ||
    code.startsWith('08') || // PostgreSQL connection exception class
    code.startsWith('53') // PostgreSQL insufficient-resource class
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
    ? isTransientPersistenceError(candidate.cause)
    : false;
}
