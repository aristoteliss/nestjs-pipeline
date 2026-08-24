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

import { createMongoAbility } from '@casl/ability';
import { capabilitiesToRawRules } from '../helpers/capability.helpers';
import type {
  AppAbility,
  AppRawRule,
  Capability,
  CapabilityString,
  CaslUserContext,
  RoleDefinition,
} from '../types/casl.types';

/**
 * Build a CASL {@link AppAbility} from role definitions and optional
 * per-user capability overrides.
 *
 * Rules are gathered from every source (all roles, then per-user additional,
 * then per-user denied) and then **globally** stable-partitioned so that every
 * direct (allow) rule precedes every inverted (deny) rule:
 *
 * 1. Role-based capabilities (all roles merged)
 * 2. Per-user additional capabilities
 * 3. Per-user denied capabilities
 *
 * CASL resolves a permission check with "last matching rule wins" semantics
 * (rules are scanned in reverse). If a deny from one source were left *before*
 * a broad allow contributed by a later source (e.g. role A denies `delete` but
 * role B grants `manage`), the allow would silently override the deny. Ordering
 * **all** inverted rules after **all** direct rules — across sources, not just
 * within a single capability list — guarantees denials always take effect.
 *
 * @param roles       - Role definitions the user belongs to
 * @param user        - User context for condition interpolation
 * @param additional  - Extra per-user capabilities
 * @param denied      - Per-user explicit denials
 */
export function buildAbility(
  roles: RoleDefinition[],
  user?: CaslUserContext | undefined,
  additional?: Array<Capability | CapabilityString>,
  denied?: Array<Capability | CapabilityString>,
): AppAbility {
  const rules: AppRawRule[] = [];

  // 1. Merge all role capabilities
  for (const role of roles) {
    rules.push(...capabilitiesToRawRules(role.capabilities, user));
  }

  // 2. Add per-user additional capabilities
  if (additional && additional.length > 0) {
    rules.push(...capabilitiesToRawRules(additional, user));
  }

  // 3. Add per-user denied capabilities
  if (denied && denied.length > 0) {
    rules.push(...capabilitiesToRawRules(denied, user));
  }

  // Place every deny after every allow so a deny from one source cannot be
  // overridden by a broader allow from another. The filter is stable, so the
  // relative order within each group is preserved.
  const orderedRules = [
    ...rules.filter((rule) => !rule.inverted),
    ...rules.filter((rule) => rule.inverted),
  ];

  return createMongoAbility<[string, string]>(orderedRules);
}

/**
 * Build a CASL ability directly from pre-computed {@link AppRawRule}s.
 *
 * Useful when the rules are already resolved — for example rebuilt from a
 * compact capability list carried in a JWT/cookie, or restored from a cache —
 * so no role/capability providers need to be queried.
 *
 * Unlike {@link buildAbility}, the rules are passed to CASL **as-is**: this
 * function does not re-order them. When the rules originate from a single
 * capability list, produce them with {@link capabilitiesToRawRules} (which
 * already places denies after allows). For rules merged from several sources,
 * prefer {@link buildAbility}.
 *
 * @example Rebuild an ability from capabilities embedded in a JWT
 * ```ts
 * import {
 *   parseCapabilityString,
 *   capabilitiesToRawRules,
 *   buildAbilityFromRules,
 * } from '@nestjs-pipeline/casl';
 *
 * // claims.caps === ['Post|read|*', 'Post|update|{"authorId":"${id}"}', '!Post|delete|*']
 * const rules = capabilitiesToRawRules(
 *   claims.caps.map(parseCapabilityString),
 *   { id: claims.sub },
 * );
 * const ability = buildAbilityFromRules(rules);
 * ```
 */
export function buildAbilityFromRules(rules: AppRawRule[]): AppAbility {
  return createMongoAbility<[string, string]>(rules);
}
