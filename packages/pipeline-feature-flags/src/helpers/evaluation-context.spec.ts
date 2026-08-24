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
import { describe, expect, it } from 'vitest';
import {
  baseEvaluationContext,
  buildEvaluationContext,
} from './evaluation-context';

function makeContext(
  overrides: Partial<IPipelineContext> = {},
): IPipelineContext {
  return {
    correlationId: 'corr-123',
    requestKind: 'command',
    requestName: 'CreateUserCommand',
    handlerName: 'CreateUserHandler',
    request: {},
    ...overrides,
  } as IPipelineContext;
}

describe('baseEvaluationContext', () => {
  it('derives targeting fields from the pipeline context', () => {
    const ctx = baseEvaluationContext(makeContext());

    expect(ctx).toEqual({
      targetingKey: 'corr-123',
      'pipeline.request.kind': 'command',
      'pipeline.request.name': 'CreateUserCommand',
      'pipeline.handler.name': 'CreateUserHandler',
    });
  });
});

describe('buildEvaluationContext', () => {
  it('returns the base context when no extra sources are given', () => {
    expect(buildEvaluationContext(makeContext())).toEqual(
      baseEvaluationContext(makeContext()),
    );
  });

  it('merges module context over the base context', () => {
    const ctx = buildEvaluationContext(makeContext(), { tier: 'premium' });

    expect(ctx.tier).toBe('premium');
    expect(ctx.targetingKey).toBe('corr-123');
  });

  it('lets the handler context win over the module context', () => {
    const ctx = buildEvaluationContext(
      makeContext(),
      { tier: 'free', region: 'us' },
      () => ({ tier: 'enterprise' }),
    );

    expect(ctx.tier).toBe('enterprise');
    expect(ctx.region).toBe('us');
  });

  it('allows the handler context to override the targeting key', () => {
    const ctx = buildEvaluationContext(makeContext(), undefined, (c) => ({
      targetingKey: `user:${c.handlerName}`,
    }));

    expect(ctx.targetingKey).toBe('user:CreateUserHandler');
  });

  it('passes the pipeline context to the handler factory', () => {
    let received: IPipelineContext | undefined;
    buildEvaluationContext(makeContext(), undefined, (c) => {
      received = c;
      return {};
    });

    expect(received?.correlationId).toBe('corr-123');
  });
});
