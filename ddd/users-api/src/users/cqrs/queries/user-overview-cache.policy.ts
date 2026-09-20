/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import {
  type CacheCondition,
  createPartitionedCacheKeyFactory,
} from '@nestjs-pipeline/cache';
import {
  getCaslAbility,
  getCaslPrincipal,
  hasEntityConditions,
} from '@nestjs-pipeline/casl';
import { type IPipelineContext, stableStringify } from '@nestjs-pipeline/core';

/**
 * Local response-policy version prefix. Bumping this invalidates responses
 * cached under previous schema or authorization policies.
 */
export const OVERVIEW_RESPONSE_POLICY_VERSION = 'v3';

function resolveViewer(
  context: IPipelineContext,
): { id: string; principalType: 'user' | 'service' } | undefined {
  const viewer = getCaslPrincipal(context);
  if (!viewer) return undefined;

  const { principalType } = viewer;
  if (principalType !== 'user' && principalType !== 'service') return undefined;

  const id = viewer.id === undefined ? '' : String(viewer.id).trim();
  return id ? { id, principalType } : undefined;
}

function resolveOverviewPrincipal(
  context: IPipelineContext,
): string | undefined {
  const viewer = resolveViewer(context);
  return viewer && `${viewer.principalType}:${viewer.id}`;
}

/**
 * Computes a deterministic permission scope fingerprint from the resolved CASL ability.
 * Incorporates role definitions, additional capabilities, explicit denials, and field restrictions.
 */
export function resolveOverviewScope(
  context: IPipelineContext,
): string | undefined {
  const ability = getCaslAbility(context);
  if (!ability) return undefined;

  const digest = createHash('sha256')
    .update(stableStringify(ability.rules))
    .digest('hex')
    .slice(0, 32);

  return `${OVERVIEW_RESPONSE_POLICY_VERSION}:${digest}`;
}

/**
 * Checks whether the viewer's effective ability has read rules whose conditions
 * depend on the mutable state of the target User, Role or UserCapabilities
 * subjects. Rules for `all` subjects are included by `hasEntityConditions`.
 */
export function hasEntityDependentConditions(
  context: IPipelineContext,
): boolean {
  const ability = getCaslAbility(context);
  if (!ability) return false;

  return hasEntityConditions(
    ability,
    [APP_SUBJECTS.USER, APP_SUBJECTS.ROLE, APP_SUBJECTS.USER_CAPABILITIES],
    APP_ACTIONS.READ,
  );
}

/**
 * Gating condition for overview caching: bypasses caching whenever authorization
 * depends on mutable target entity state that response caching cannot invalidate.
 * Fails closed when required context is missing.
 */
export const userOverviewCacheCondition: CacheCondition = (
  context: IPipelineContext,
): boolean => {
  return !hasEntityDependentConditions(context);
};

export const userOverviewCacheKey = createPartitionedCacheKeyFactory({
  requireTenant: true,
  requirePrincipal: true,
  requireScope: true,
  principal: resolveOverviewPrincipal,
  scope: resolveOverviewScope,
});

export const userOverviewCacheOptions = {
  ttl: 60_000,
  key: userOverviewCacheKey,
  condition: userOverviewCacheCondition,
};
