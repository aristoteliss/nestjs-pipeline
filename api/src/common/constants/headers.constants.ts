/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * The HTTP request headers the application reads.
 */
export const HEADERS = {
  /** Identifier of a machine API client. */
  API_ID: 'x-api-id',
  /** Secret key of a machine API client; redacted from logs. */
  API_KEY: 'x-api-key',
  /** The tenant a request is for. */
  TENANT_SCHEMA: 'x-tenant-schema',
  /** The client-chosen identity of one create operation. */
  IDEMPOTENCY_KEY: 'idempotency-key',
} as const;
