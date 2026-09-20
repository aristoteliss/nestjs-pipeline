/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: placeholders are data */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import {
  CASL_BEHAVIOR_ID,
  CaslBehavior,
  type CaslBehaviorOptions,
} from './casl.behavior';
import { CASL_ABILITY_KEY, CASL_PRINCIPAL_KEY } from './constants/tokens';
import { UnauthorizedActionException } from './errors/unauthorized-action.exception';
import type {
  CaslAuthorizationInput,
  ICaslPermissionSource,
} from './interfaces/permission-source.interface';
import type { AppAbility, Capability } from './types/casl.types';

function makeContext(options?: CaslBehaviorOptions): IPipelineContext {
  return {
    correlationId: 'corr-1',
    request: {},
    requestName: 'GetUserQuery',
    handlerName: 'GetUserHandler',
    requestKind: 'query',
    startedAt: new Date(),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue(options),
  } as unknown as IPipelineContext;
}

function sourceOf(
  load: () => Promise<CaslAuthorizationInput | null>,
): ICaslPermissionSource & { load: ReturnType<typeof vi.fn> } {
  return { load: vi.fn(load) };
}

const principal = { id: 'u-1', department: 'engineering' };

function run(
  rules: Capability[],
  options: CaslBehaviorOptions,
  context = makeContext(options),
) {
  const source = sourceOf(async () => ({ principal, rules }));
  const next = vi.fn().mockResolvedValue('handled');
  return {
    context,
    next,
    result: new CaslBehavior(source).handle(context, next),
  };
}

describe('CaslBehavior', () => {
  it('has the stable identity other packages order against', () => {
    expect(CASL_BEHAVIOR_ID).toBe('@nestjs-pipeline/casl:CaslBehavior');
    expect(CaslBehavior.name).toBe('CaslBehavior');
  });

  it('calls next without loading permissions when no rules are declared', async () => {
    const source = sourceOf(async () => null);
    const next = vi.fn().mockResolvedValue('handled');

    await expect(
      new CaslBehavior(source).handle(makeContext(undefined), next),
    ).resolves.toBe('handled');
    expect(source.load).not.toHaveBeenCalled();
  });

  it('requires authentication when the source returns null', async () => {
    const source = sourceOf(async () => null);
    const next = vi.fn();
    const context = makeContext({
      rules: [{ action: 'read', subject: 'User' }],
    });

    const error = await new CaslBehavior(source)
      .handle(context, next)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedActionException);
    expect(error).toMatchObject({
      action: 'read',
      subject: 'User',
      message: 'Access denied — authentication required.',
    });
    expect(source.load).toHaveBeenCalledWith(context);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes a type-level check with a conditional rule', async () => {
    const { result, next } = run(
      [
        {
          subject: 'User',
          action: 'read',
          conditions: { department: '${user.department}' },
        },
      ],
      { rules: [{ action: 'read', subject: 'User' }] },
    );

    await expect(result).resolves.toBe('handled');
    expect(next).toHaveBeenCalledOnce();
  });

  it('denies a failing requirement', async () => {
    const { result, next } = run([{ subject: 'User', action: 'read' }], {
      rules: [
        { action: 'read', subject: 'User' },
        { action: 'delete', subject: 'User' },
      ],
    });

    const error = await result.catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedActionException);
    expect(error).toMatchObject({ action: 'delete', subject: 'User' });
    expect((error as UnauthorizedActionException).fields).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('denies a failing field requirement', async () => {
    const { result } = run(
      [
        { subject: 'User', action: 'update' },
        {
          subject: 'User',
          action: 'update',
          fields: ['department'],
          inverted: true,
        },
      ],
      { rules: [{ action: 'update', subject: 'User', field: 'department' }] },
    );

    await expect(result).rejects.toMatchObject({
      action: 'update',
      subject: 'User',
      fields: ['department'],
    });
  });

  it('stores the ability and principal in context items', async () => {
    const { result, context } = run([{ subject: 'User', action: 'read' }], {
      rules: [{ action: 'read', subject: 'User' }],
    });

    await result;

    expect(context.items.get(CASL_PRINCIPAL_KEY)).toBe(principal);
    const ability = context.items.get(CASL_ABILITY_KEY) as AppAbility;
    expect(ability.can('read', 'User')).toBe(true);
  });

  it.each([
    ['first', 0],
    ['middle', 1],
    ['last', 2],
  ])('lets a deny in the %s position win', async (_, position) => {
    const rules: Capability[] = [
      { subject: 'all', action: 'manage' },
      { subject: 'Role', action: 'read' },
    ];
    rules.splice(position, 0, {
      subject: 'User',
      action: 'delete',
      inverted: true,
    });
    const { result } = run(rules, {
      rules: [{ action: 'delete', subject: 'User' }],
    });

    await expect(result).rejects.toBeInstanceOf(UnauthorizedActionException);
  });

  it('throws for a placeholder the principal cannot resolve', async () => {
    const { result, next } = run(
      [
        {
          subject: 'User',
          action: 'read',
          conditions: { region: '${user.region}' },
        },
      ],
      { rules: [{ action: 'read', subject: 'User' }] },
    );

    const error = await result.catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(UnauthorizedActionException);
    expect((error as Error).message).toContain('region');
    expect(next).not.toHaveBeenCalled();
  });

  it('propagates a permission source failure unchanged', async () => {
    const failure = new Error('database unavailable');
    const source = sourceOf(async () => {
      throw failure;
    });

    await expect(
      new CaslBehavior(source).handle(
        makeContext({ rules: [{ action: 'read', subject: 'User' }] }),
        vi.fn(),
      ),
    ).rejects.toBe(failure);
  });

  it('propagates malformed rule data as its own error, not as a denial', async () => {
    const { result } = run([{ subject: 'User', action: 'read', fields: [] }], {
      rules: [{ action: 'read', subject: 'User' }],
    });

    const error = await result.catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toMatch(/empty fields list/);
  });

  it('imports nothing from Nest HTTP exceptions', () => {
    const files = readdirSync(__dirname, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .map((file) => readFileSync(join(__dirname, file), 'utf8'));

    for (const source of files) {
      expect(source).not.toMatch(/HttpException|ForbiddenException/);
    }
  });
});
