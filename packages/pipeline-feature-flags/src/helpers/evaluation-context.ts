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
import type { EvaluationContextFactory } from '../interfaces/feature-flags-options.interface';

/**
 * Derives a base OpenFeature {@link EvaluationContext} from the live pipeline
 * request so flag targeting rules can key off it out of the box.
 *
 * `targetingKey` defaults to the request's correlation id, which is stable only
 * for that request. Override it with user/account/device identity when rollout
 * assignment must remain sticky across later requests.
 */
export function baseEvaluationContext(
  context: IPipelineContext,
): EvaluationContext {
  return {
    targetingKey: context.correlationId,
    'pipeline.request.kind': context.requestKind,
    'pipeline.request.name': context.requestName,
    'pipeline.handler.name': context.handlerName,
  };
}

/**
 * Merges the targeting context for an evaluation, later sources winning:
 * `base(request)` → `moduleContext` → `handlerContext(request)`.
 */
export function buildEvaluationContext(
  context: IPipelineContext,
  moduleContext?: EvaluationContext,
  handlerContext?: EvaluationContextFactory,
): EvaluationContext {
  return {
    ...baseEvaluationContext(context),
    ...moduleContext,
    ...handlerContext?.(context),
  };
}
