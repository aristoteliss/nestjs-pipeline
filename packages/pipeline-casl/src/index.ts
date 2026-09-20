/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  CASL_BEHAVIOR_ID,
  CaslBehavior,
  type CaslBehaviorOptions,
} from './casl.behavior';
export { CaslModule, type CaslModuleOptions } from './casl.module';
export {
  CASL_ABILITY_KEY,
  CASL_ACTIONS,
  CASL_PERMISSION_SOURCE,
  CASL_PRINCIPAL_KEY,
  CASL_SUBJECTS,
  type CaslAction,
  type CaslSubject,
} from './constants/tokens';
export {
  type UnauthorizedActionDetails,
  UnauthorizedActionException,
} from './errors/unauthorized-action.exception';
export { buildAbility, interpolateConditions } from './helpers/ability';
export {
  CaslAuthorizer,
  getCaslAbility,
  getCaslPrincipal,
  hasEntityConditions,
} from './helpers/authorizer';
export {
  normalizeCapability,
  parseCapabilityString,
  serializeCapability,
} from './helpers/capability';
export { requires } from './helpers/requires';
export type {
  CaslAuthorizationInput,
  CaslPrincipal,
  ICaslPermissionSource,
} from './interfaces/permission-source.interface';
export type {
  AbilityRequirement,
  AppAbility,
  AppRawRule,
  Capability,
  CapabilityString,
  Projected,
} from './types/casl.types';
