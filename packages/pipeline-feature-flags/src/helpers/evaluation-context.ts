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

import type { IPipelineContext } from '@nestjs-pipeline/core';
import type { EvaluationContext } from '@openfeature/server-sdk';
import type {
  EvaluationContextFactory,
  TargetingKeyFactory,
} from '../interfaces/feature-flags-options.interface';

/**
 * Base OpenFeature attributes derived from the live pipeline request.
 *
 * Deliberately does not synthesize `targetingKey` from correlationId: correlation
 * IDs are request-scoped and therefore unsafe for sticky percentage rollouts.
 */
export function baseEvaluationContext(
  context: IPipelineContext,
): EvaluationContext {
  return {
    'pipeline.request.kind': context.requestKind,
    'pipeline.request.name': context.requestName,
    'pipeline.handler.name': context.handlerName,
    'pipeline.correlation_id': context.correlationId,
    ...(context.tenantId ? { 'pipeline.tenant_id': context.tenantId } : {}),
  };
}

/**
 * Builds an evaluation context in this order:
 * base pipeline attributes → module context → handler context → targeting-key factory.
 *
 * A targeting key already provided by module/handler context is preserved when
 * the factory returns `undefined`. A non-empty factory result wins when present.
 */
export function buildEvaluationContext(
  context: IPipelineContext,
  moduleContext?: EvaluationContext,
  handlerContext?: EvaluationContextFactory,
  targetingKeyFactory?: TargetingKeyFactory,
): EvaluationContext {
  const result: EvaluationContext = {
    ...baseEvaluationContext(context),
    ...moduleContext,
    ...handlerContext?.(context),
  };

  const targetingKey = targetingKeyFactory?.(context)?.trim();
  if (targetingKey) result.targetingKey = targetingKey;

  return result;
}
