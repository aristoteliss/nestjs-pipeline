/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Protocol header names used for authentication and multi-tenant routing.
 */
export const AUTH_HEADERS = {
  /** Identifier header for machine API clients. */
  API_ID: 'x-api-id',
  /** Secret key header for machine API clients. */
  API_KEY: 'x-api-key',
  /** Tenant schema routing header. */
  TENANT_SCHEMA: 'x-tenant-schema',
} as const;

export type AuthHeader = (typeof AUTH_HEADERS)[keyof typeof AUTH_HEADERS];
