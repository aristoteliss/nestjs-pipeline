/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: placeholders are data */
import { createMongoAbility } from '@casl/ability';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { CASL_ABILITY_KEY } from '../constants/tokens.js';
import { MissingAbilityError } from '../errors/missing-ability.error.js';
import type { AppAbility } from '../types/casl.types.js';
import { buildAbility } from './ability.js';
import { abilityDigest, requireAbilityDigest } from './ability-digest.js';

const contextWith = (ability?: AppAbility): IPipelineContext =>
  ({
    items: new Map<symbol, unknown>(
      ability ? [[CASL_ABILITY_KEY, ability]] : [],
    ),
  }) as IPipelineContext;

const digestOf = (
  rules: Parameters<typeof buildAbility>[0],
  principal?: Parameters<typeof buildAbility>[1],
) => abilityDigest(contextWith(buildAbility(rules, principal)));

describe('abilityDigest', () => {
  it('is undefined when no ability is present', () => {
    expect(abilityDigest(contextWith())).toBeUndefined();
    expect(abilityDigest()).toBeUndefined();
  });

  it('reads the ability of the running pipeline when no context is passed', () => {
    const context = contextWith(buildAbility(['User|read|*']));

    expect(pipelineStore.run(context, () => abilityDigest())).toBe(
      abilityDigest(context),
    );
  });

  it('is a stable SHA-256 hex digest of identical rules', () => {
    const digest = digestOf(['User|read|*', 'Role|read|*']);

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digestOf(['User|read|*', 'Role|read|*'])).toBe(digest);
  });

  it('changes with the rules, their order, fields and inversion', () => {
    const base = digestOf(['User|read|*', 'Role|read|*']);

    expect(digestOf(['Role|read|*', 'User|read|*'])).not.toBe(base);
    expect(digestOf(['User|read|*|id', 'Role|read|*'])).not.toBe(base);
    expect(digestOf(['User|read|*', '!Role|read|*'])).not.toBe(base);
    expect(digestOf(['User|read|*'])).not.toBe(base);
  });

  it('changes with a principal value an unchanged condition interpolates', () => {
    const rule = 'User|read|{"department":"${department}"}';

    expect(digestOf([rule], { id: 'u-1', department: 'engineering' })).not.toBe(
      digestOf([rule], { id: 'u-1', department: 'sales' }),
    );
  });

  it('refuses rules that are not plain JSON', () => {
    const ability = createMongoAbility<[string, string]>([
      { action: 'read', subject: 'User', conditions: { name: /^a/ } },
    ]);

    expect(() => abilityDigest(contextWith(ability))).toThrow(TypeError);
  });
});

describe('requireAbilityDigest', () => {
  it('returns the digest of the present ability', () => {
    const context = contextWith(buildAbility(['User|read|*']));

    expect(requireAbilityDigest(context)).toBe(abilityDigest(context));
  });

  it('fails closed without an ability', () => {
    expect(() => requireAbilityDigest(contextWith())).toThrow(
      new MissingAbilityError('an authorization digest'),
    );
    expect(() => requireAbilityDigest(contextWith())).toThrow(
      MissingAbilityError,
    );
  });
});
