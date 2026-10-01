/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  CASL_BEHAVIOR_ID,
  CaslBehavior,
  type CaslBehaviorOptions,
} from './casl.behavior.js';
export { CaslModule, type CaslModuleOptions } from './casl.module.js';
export {
  CASL_ABILITY_KEY,
  CASL_ACTIONS,
  CASL_PERMISSION_SOURCE,
  CASL_PRINCIPAL_KEY,
  CASL_SUBJECTS,
  type CaslAction,
  type CaslSubject,
} from './constants/tokens.js';
export { MissingAbilityError } from './errors/missing-ability.error.js';
export {
  type UnauthorizedActionDetails,
  UnauthorizedActionException,
} from './errors/unauthorized-action.exception.js';
export { UnauthorizedActionFilter } from './filters/unauthorized-action.filter.js';
export { buildAbility, interpolateConditions } from './helpers/ability.js';
export {
  abilityDigest,
  requireAbilityDigest,
} from './helpers/ability-digest.js';
export {
  CaslAuthorizer,
  getCaslAbility,
  getCaslPrincipal,
  hasEntityConditions,
} from './helpers/authorizer.js';
export {
  normalizeCapability,
  parseCapabilityString,
  serializeCapability,
} from './helpers/capability.js';
export { requires } from './helpers/requires.js';
export type {
  CaslAuthorizationInput,
  CaslPrincipal,
  ICaslPermissionSource,
} from './interfaces/permission-source.interface.js';
export type {
  AbilityRequirement,
  AppAbility,
  AppRawRule,
  Capability,
  CapabilityString,
  Projected,
} from './types/casl.types.js';
