/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type IPipelineContext, setPipelineItem } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { FEATURE_FLAG_DECISION_ITEM_TOKEN } from '../feature-flag.behavior.js';
import { buildFeatureFlagAttributes } from './build-attributes.js';

const context = () => ({ items: new Map() }) as unknown as IPipelineContext;

describe('buildFeatureFlagAttributes', () => {
  it('reports nothing when the feature-flag behavior did not run', () => {
    expect(buildFeatureFlagAttributes(context())).toEqual({});
  });

  it('omits the fields the provider did not report', () => {
    const ctx = context();
    setPipelineItem(ctx, FEATURE_FLAG_DECISION_ITEM_TOKEN, {
      flagKey: 'user-registration',
      value: true,
      enabled: true,
    });

    expect(buildFeatureFlagAttributes(ctx)).toEqual({
      'feature_flag.key': 'user-registration',
      'feature_flag.enabled': true,
    });
  });

  it('carries variant, reason and the error code of a failed evaluation', () => {
    const ctx = context();
    setPipelineItem(ctx, FEATURE_FLAG_DECISION_ITEM_TOKEN, {
      flagKey: 'user-registration',
      value: false,
      enabled: false,
      variant: 'off',
      reason: 'ERROR',
      errorCode: 'FLAG_NOT_FOUND',
      errorMessage: 'no such flag',
      targetingKey: 'user-1',
    });

    expect(buildFeatureFlagAttributes(ctx)).toEqual({
      'feature_flag.key': 'user-registration',
      'feature_flag.enabled': false,
      'feature_flag.variant': 'off',
      'feature_flag.reason': 'ERROR',
      'feature_flag.error_code': 'FLAG_NOT_FOUND',
    });
  });
});
