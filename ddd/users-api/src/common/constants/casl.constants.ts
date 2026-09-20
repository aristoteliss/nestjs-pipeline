/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { subject as caslSubject } from '@casl/ability';
import { CASL_ACTIONS, CASL_SUBJECTS } from '@nestjs-pipeline/casl';

/**
 * Application domain subjects used in CASL access-control rules.
 */
export const APP_SUBJECTS = {
  ...CASL_SUBJECTS,
  /** User domain entity and aggregate. */
  USER: 'User',
  /** Role domain entity and aggregate. */
  ROLE: 'Role',
  /**
   * A user's effective permissions — assigned roles and additional capabilities.
   * Distinct from `USER` because reading someone's profile and reading what they
   * are allowed to do are separate grants.
   */
  USER_CAPABILITIES: 'UserCapabilities',
} as const;

export type AppSubject = (typeof APP_SUBJECTS)[keyof typeof APP_SUBJECTS];

/**
 * Builds the authorization subject for one user's effective permissions.
 *
 * The `userId` attribute is what a capability condition matches on, so a rule
 * such as `UserCapabilities|read|{"userId":"${user.id}"}` grants a principal
 * their own permissions without exposing anyone else's.
 */
export function userCapabilitiesSubject(userId: string): object {
  return caslSubject(APP_SUBJECTS.USER_CAPABILITIES, { userId });
}

/**
 * Operations / actions supported in CASL permission definitions.
 * Inherits standard CASL verbs (manage, create, read, update, delete) from @nestjs-pipeline/casl.
 */
export const APP_ACTIONS = CASL_ACTIONS;

export type AppAction = (typeof APP_ACTIONS)[keyof typeof APP_ACTIONS];
