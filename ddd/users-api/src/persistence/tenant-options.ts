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

import { BadRequestException } from '@nestjs/common';

export const DEFAULT_TENANT_SCHEMA = 'tenant';
const SCHEMA_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Returns a normalized, syntactically safe tenant schema name. */
export function normalizeSchemaName(value?: string | null): string {
  const candidate = (
    value ??
    process.env.DB_DEFAULT_SCHEMA ??
    DEFAULT_TENANT_SCHEMA
  ).trim();

  if (!candidate) return DEFAULT_TENANT_SCHEMA;

  if (!SCHEMA_NAME_REGEX.test(candidate)) {
    throw new BadRequestException(`Invalid schema name: ${candidate}`);
  }

  return candidate;
}
