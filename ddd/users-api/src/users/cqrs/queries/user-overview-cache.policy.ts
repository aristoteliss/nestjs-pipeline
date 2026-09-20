/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
import { APP_SUBJECTS } from '@common/constants';
import { getSessionUserFromStore } from '@common/context/session-user.store';
import type { SessionUser } from '@common/types/SessionUser';
import {
  type CacheCondition,
  createPartitionedCacheKeyFactory,
} from '@nestjs-pipeline/cache';
import {
  CASL_USER_CONTEXT_KEY,
  getCaslAbility,
  hasEntityConditions,
} from '@nestjs-pipeline/casl';
import { type IPipelineContext, stableStringify } from '@nestjs-pipeline/core';

/**
 * Local response-policy version prefix. Bumping this invalidates responses
 * cached under previous schema or authorization policies.
 */
export const OVERVIEW_RESPONSE_POLICY_VERSION = 'v2';

/**
 * Resolves the authenticated viewer from trusted execution context.
 * Rejects missing or malformed principal classification to ensure fail-closed security.
 */
export function getViewerFromContext(
  context: IPipelineContext,
): { id: string; principalType: 'user' | 'service' } | undefined {
  const itemUser = context.items.get('user') as SessionUser | undefined;
  if (
    itemUser?.id &&
    (itemUser.principalType === 'user' || itemUser.principalType === 'service')
  ) {
    return {
      id: String(itemUser.id).trim(),
      principalType: itemUser.principalType,
    };
  }

  const caslUser = context.items.get(CASL_USER_CONTEXT_KEY) as
    | { id?: unknown; principalType?: unknown }
    | undefined;
  if (
    caslUser?.id &&
    (caslUser.principalType === 'user' || caslUser.principalType === 'service')
  ) {
    return {
      id: String(caslUser.id).trim(),
      principalType: caslUser.principalType as 'user' | 'service',
    };
  }

  const storeUser = getSessionUserFromStore();
  if (
    storeUser?.id &&
    (storeUser.principalType === 'user' ||
      storeUser.principalType === 'service')
  ) {
    return {
      id: String(storeUser.id).trim(),
      principalType: storeUser.principalType,
    };
  }

  return undefined;
}

/**
 * Resolves the partitioned principal identifier including principal classification
 * to prevent collisions between user and service principals with identical IDs.
 */
export function resolveOverviewPrincipal(
  context: IPipelineContext,
): string | undefined {
  const viewer = getViewerFromContext(context);
  if (!viewer?.id) return undefined;
  return `${viewer.principalType}:${viewer.id}`;
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
 * Checks whether the viewer's effective ability contains rules with conditions
 * that depend on the mutable state of the target User or Role entities.
 */
export function hasEntityDependentConditions(
  context: IPipelineContext,
): boolean {
  const ability = getCaslAbility(context);
  if (!ability) return false;

  return hasEntityConditions(ability, [
    APP_SUBJECTS.USER,
    APP_SUBJECTS.ROLE,
    'all',
  ]);
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
