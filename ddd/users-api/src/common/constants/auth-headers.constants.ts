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
