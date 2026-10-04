/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

/**
 * Where pipelines and jobs read and restore the tenant and correlation id:
 * the stores of `@cqrs-ddd/pipeline-tenant` and `@cqrs-ddd/pipeline-correlation`.
 */
export const contextSources = {
  tenantId: tenantSource,
  correlationId: correlationSource,
} as const;
