/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
} as const;

export type AppSubject = (typeof APP_SUBJECTS)[keyof typeof APP_SUBJECTS];

/**
 * Operations / actions supported in CASL permission definitions.
 * Inherits standard CASL verbs (manage, create, read, update, delete) from @nestjs-pipeline/casl.
 */
export const APP_ACTIONS = CASL_ACTIONS;

export type AppAction = (typeof APP_ACTIONS)[keyof typeof APP_ACTIONS];
