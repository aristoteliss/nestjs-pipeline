/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
