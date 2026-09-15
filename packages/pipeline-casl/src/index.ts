/* Copyright (C) 2026-present Aristotelis — see repository license. */

// Behavior
export { CaslBehavior, CaslBehaviorOptions } from './casl.behavior';
// Module
export { CaslModule, CaslModuleOptions } from './casl.module';
// Tokens
export {
  CASL_ABILITY_KEY,
  CASL_ACTIONS,
  CASL_BEHAVIOR_LOGGER,
  CASL_FIELDS_FROM_REQUEST,
  CASL_ROLE_PROVIDER,
  CASL_SUBJECT_CONTEXT_PATHS,
  CASL_SUBJECTS,
  CASL_USER_CAPABILITY_PROVIDER,
  CASL_USER_CONTEXT_KEY,
  CASL_USER_CONTEXT_RESOLVER,
  type CaslAction,
  type CaslSubject,
} from './constants/tokens';
export {
  type UnauthorizedActionDetails,
  UnauthorizedActionException,
} from './exceptions/unauthorized-action.exception';
// Helpers
export {
  capabilitiesToRawRules,
  capabilityToRawRule,
  interpolateConditions,
  normalizeCapability,
  parseCapabilityString,
  serializeCapability,
} from './helpers/capability.helpers';
export {
  CaslAuthorizer,
  type CaslAuthorizerOptions,
  type CaslBypassContext,
  CaslEntityAuthorizer,
  getCaslAbility,
} from './helpers/entity-authorization.helper';
export {
  ENTITY_AUTHORIZER,
  type IEntityAuthorizer,
} from './interfaces/entity-authorizer.interface';
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
  buildBypassAbility,
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
