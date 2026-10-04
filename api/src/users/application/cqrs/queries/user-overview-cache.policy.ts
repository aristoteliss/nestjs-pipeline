/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants/index.js';
import { principalSegments } from '@common/types/session-principal.js';
import { type IPipelineContext } from '@cqrs-ddd/pipeline';
import {
  type CacheCondition,
  createPartitionedCacheKeyFactory,
} from '@cqrs-ddd/pipeline-cache';
import {
  abilityDigest,
  getCaslAbility,
  getCaslPrincipal,
  hasEntityConditions,
} from '@cqrs-ddd/pipeline-casl';
import { joinKeySegments } from '@cqrs-ddd/safe-stringify';

/**
 * Local response-policy version prefix. Bumping this invalidates responses
 * cached under previous schema or authorization policies.
 */
export const OVERVIEW_RESPONSE_POLICY_VERSION = 'v3';

function resolveOverviewPrincipal(
  context: IPipelineContext,
): string | undefined {
  const viewer = getCaslPrincipal(context);
  const segments = principalSegments({
    id: viewer?.id,
    type: viewer?.principalType,
  });
  return segments && joinKeySegments(segments);
}

/**
 * The permission-scope segment of the overview key: the versioned
 * `abilityDigest` of the viewer, so a change of role definitions, additional
 * capabilities, explicit denials or field restrictions reads a different entry.
 */
export function resolveOverviewScope(
  context: IPipelineContext,
): string | undefined {
  const digest = abilityDigest(context);
  return digest && `${OVERVIEW_RESPONSE_POLICY_VERSION}:${digest}`;
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
