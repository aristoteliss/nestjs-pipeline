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

// Behavior
export { CaslBehavior, CaslBehaviorOptions } from './casl.behavior';

// Module
export { CaslModule, CaslModuleOptions } from './casl.module';
// Tokens
export {
  CASL_ABILITY_KEY,
  CASL_BEHAVIOR_LOGGER,
  CASL_FIELDS_FROM_REQUEST,
  CASL_ROLE_PROVIDER,
  CASL_SUBJECT_CONTEXT_PATHS,
  CASL_USER_CAPABILITY_PROVIDER,
  CASL_USER_CONTEXT_KEY,
  CASL_USER_CONTEXT_RESOLVER,
} from './constants/tokens';
// Helpers
export {
  capabilitiesToRawRules,
  capabilityToRawRule,
  interpolateConditions,
  normalizeCapability,
  parseCapabilityString,
  serializeCapability,
} from './helpers/capability.helpers';
// Interfaces (for implementers)
export {
  IRoleProvider,
  IUserCapabilityProvider,
  IUserContextResolver,
} from './interfaces/providers.interface';
// Built-in providers
export { StaticRoleProvider } from './providers/static-role.provider';

// Factory
export {
  buildAbility,
  buildAbilityFromRules,
} from './services/ability.factory';
// Types
export {
  AbilityRequirement,
  AppAbility,
  AppRawRule,
  Capability,
  CapabilityString,
  CaslUserContext,
  RoleDefinition,
  UserCapabilities,
} from './types/casl.types';
