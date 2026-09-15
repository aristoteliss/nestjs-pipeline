/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
      'pipeline.request.kind': 'command',
      'pipeline.request.name': 'CreateUserCommand',
      'pipeline.handler.name': 'CreateUserHandler',
      'pipeline.correlation_id': 'corr-123',
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
    expect(ctx['pipeline.correlation_id']).toBe('corr-123');
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
