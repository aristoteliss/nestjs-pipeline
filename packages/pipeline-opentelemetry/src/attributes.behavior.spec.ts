/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import {
  AttributesBehavior,
  type AttributesBehaviorOptions,
} from './attributes.behavior.js';
import {
  getPipelineTelemetryAttributes,
  type PipelineTelemetryAttributeFactory,
} from './telemetry-attributes.js';

const DECISION = Symbol('DECISION');

function contextWith(
  options?: AttributesBehaviorOptions,
  items: Map<string | symbol, unknown> = new Map(),
): IPipelineContext {
  return {
    items,
    getBehaviorOptions: () => options,
  } as unknown as IPipelineContext;
}

const decision: PipelineTelemetryAttributeFactory = (ctx) =>
  ctx.items.has(DECISION)
    ? { decision: ctx.items.get(DECISION) as string }
    : {};

describe('AttributesBehavior', () => {
  it('reads what inner behaviors published, not only what was set before it', async () => {
    const context = contextWith({ factories: [decision] });

    const result = await new AttributesBehavior().handle(context, async () => {
      context.items.set(DECISION, 'made');
      return 'result';
    });

    expect(result).toBe('result');
    expect(getPipelineTelemetryAttributes(context)).toEqual({
      decision: 'made',
    });
  });

  it('collects on failure and rethrows the original error', async () => {
    const context = contextWith({ factories: [decision] });
    const error = new Error('handler failed');

    await expect(
      new AttributesBehavior().handle(context, async () => {
        context.items.set(DECISION, 'rejected');
        throw error;
      }),
    ).rejects.toBe(error);
    expect(getPipelineTelemetryAttributes(context)).toEqual({
      decision: 'rejected',
    });
  });

  it('applies factories in order, awaits async ones and keeps earlier bag entries', async () => {
    const context = contextWith({
      factories: [
        () => ({ shared: 'first', only: 'first' }),
        async () => ({ shared: 'second' }),
      ],
    });
    context.items.set(Symbol.for('@nestjs-pipeline/opentelemetry/attributes'), {
      earlier: true,
    });

    await new AttributesBehavior().handle(context, async () => 'ok');

    expect(getPipelineTelemetryAttributes(context)).toEqual({
      earlier: true,
      shared: 'second',
      only: 'first',
    });
  });

  it('skips a failing factory and keeps the others', async () => {
    const context = contextWith({
      factories: [
        () => {
          throw new Error('broken');
        },
        () => Promise.reject(new Error('rejected')),
        () => ({ kept: true }),
      ],
    });

    await new AttributesBehavior().handle(context, async () => 'ok');

    expect(getPipelineTelemetryAttributes(context)).toEqual({ kept: true });
  });

  it('adds nothing without factories', async () => {
    const context = contextWith();

    await new AttributesBehavior().handle(context, async () => 'ok');

    expect(getPipelineTelemetryAttributes(context)).toEqual({});
  });

  it('does not change the outcome when the bag cannot be written', async () => {
    const items = new Map<string | symbol, unknown>();
    items.set = () => {
      throw new Error('frozen');
    };
    const context = contextWith({ factories: [() => ({ a: 1 })] }, items);

    await expect(
      new AttributesBehavior().handle(context, async () => 'ok'),
    ).resolves.toBe('ok');
  });
});
