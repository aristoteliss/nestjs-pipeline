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
