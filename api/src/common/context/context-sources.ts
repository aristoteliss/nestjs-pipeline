/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { correlationSource } from '@nestjs-pipeline/correlation';
import { tenantSource } from '@nestjs-pipeline/tenant';

/**
 * Where pipelines and jobs read and restore the tenant and correlation id:
 * the stores of `@nestjs-pipeline/tenant` and `@nestjs-pipeline/correlation`.
 */
export const contextSources = {
  tenantId: tenantSource,
  correlationId: correlationSource,
} as const;
