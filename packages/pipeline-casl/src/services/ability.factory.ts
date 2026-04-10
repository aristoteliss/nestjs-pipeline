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
 * Rule composition order — each phase internally places direct (allow)
 * rules before inverted (deny) rules via {@link capabilitiesToRawRules}:
 *
 * 1. Role-based capabilities (all roles merged)
 * 2. Per-user additional capabilities
 * 3. Per-user denied capabilities
 *
 * Because CASL evaluates rules in definition order with "last rule wins"
 * semantics, denials added later correctly restrict broader grants.
 *
 * @param roles       - Role definitions the user belongs to
 * @param user        - User context for condition interpolation
 * @param additional  - Extra per-user capabilities
 * @param denied      - Per-user explicit denials
 */
export function buildAbility(
  roles: RoleDefinition[],
  user: CaslUserContext,
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

  // 3. Add per-user denied capabilities (always at the end)
  if (denied && denied.length > 0) {
    rules.push(...capabilitiesToRawRules(denied, user));
  }

  return createMongoAbility<[string, string]>(rules);
}

/**
 * Build a CASL ability directly from raw rules.
 * Useful when rules are pre-computed or loaded from cache.
 */
export function buildAbilityFromRules(rules: AppRawRule[]): AppAbility {
  return createMongoAbility<[string, string]>(rules);
}
