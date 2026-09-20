/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createMongoAbility } from '@casl/ability';
import {
  getBehaviorId,
  type IPipelineContext,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
  UsePipeline,
} from '@nestjs-pipeline/core';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { CaslBehavior, type CaslBehaviorOptions } from '../casl.behavior';
import { UnauthorizedActionException } from '../exceptions/unauthorized-action.exception';
import { type AuthorizeOptions, authorize } from './authorize.intent';

const ability = createMongoAbility<[string, string]>([
  { action: 'update', subject: 'Post', fields: ['title'] },
]);

async function execute(
  options: AuthorizeOptions,
  next = vi.fn(async () => 'ok'),
) {
  @UsePipeline(authorize(options))
  class Handler {}
  const metadata: Map<unknown, CaslBehaviorOptions> = Reflect.getMetadata(
    PIPELINE_BEHAVIORS_OPTIONS_METADATA,
    Handler,
  );
  const context = {
    request: { title: 'Allowed', salary: 100 },
    items: new Map(),
    getBehaviorOptions: () => metadata.get(getBehaviorId(CaslBehavior)),
  } as unknown as IPipelineContext;
  return new CaslBehavior({ getRoles: async () => [] }).handle(context, next);
}

describe('authorize intent', () => {
  it.each([undefined, 'Post'])(
    'checks denied fields with subjectFromRequest=%s',
    async (subjectFromRequest) => {
      const next = vi.fn(async () => 'ok');
      await expect(
        execute(
          {
            action: 'update',
            subject: 'Post',
            field: 'salary',
            subjectFromRequest,
            prebuiltAbility: ability,
          },
          next,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedActionException);
      expect(next).not.toHaveBeenCalled();
    },
  );

  it('allows an authorized field', async () => {
    await expect(
      execute({
        action: 'update',
        subject: 'Post',
        field: 'title',
        prebuiltAbility: ability,
      }),
    ).resolves.toBe('ok');
  });

  it('requires every rule to pass', async () => {
    await expect(
      execute({
        rules: [
          { action: 'update', subject: 'Post', field: 'title' },
          { action: 'update', subject: 'Post', field: 'salary' },
        ],
        prebuiltAbility: ability,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedActionException);
  });

  it('permits explicit bypass with a deny-all ability', async () => {
    await expect(
      execute({
        skipCheck: true,
        prebuiltAbility: createMongoAbility<[string, string]>([]),
      }),
    ).resolves.toBe('ok');
  });

  it('requires rules or explicit bypass at compile time', () => {
    expectTypeOf<object>().not.toExtend<AuthorizeOptions>();
    expectTypeOf<{
      prebuiltAbility: typeof ability;
    }>().not.toExtend<AuthorizeOptions>();
    expectTypeOf<{ rules: [] }>().not.toExtend<AuthorizeOptions>();
    expectTypeOf<{ action: string }>().not.toExtend<AuthorizeOptions>();
    expectTypeOf<{ skipCheck: false }>().not.toExtend<AuthorizeOptions>();
    expectTypeOf<{
      action: string;
      subject: string;
      skipCheck: true;
    }>().not.toExtend<AuthorizeOptions>();
    // @ts-expect-error Requirements use field; multiple fields need separate rules.
    authorize({ action: 'update', subject: 'Post', fields: ['salary'] });
  });
});
