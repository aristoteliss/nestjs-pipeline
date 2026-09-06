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

/**
 * Injection tokens for the CASL pipeline behavior.
 */

/**
 * Token for the {@link IUserContextResolver} implementation.
 * Resolves the current user from the pipeline context items.
 */
export const CASL_USER_CONTEXT_RESOLVER = Symbol('CASL_USER_CONTEXT_RESOLVER');

/**
 * Token for the {@link IRoleProvider} implementation.
 * Provides role definitions (from DB, YAML, static config, etc.).
 */
export const CASL_ROLE_PROVIDER = Symbol('CASL_ROLE_PROVIDER');

/**
 * Token for the optional {@link IUserCapabilityProvider} implementation.
 * Provides per-user capability overrides beyond role-based permissions.
 */
export const CASL_USER_CAPABILITY_PROVIDER = Symbol(
  'CASL_USER_CAPABILITY_PROVIDER',
);

/**
 * Token for global default request paths used to extract contextual session
 * payload for instance-level subject checks.
 */
export const CASL_SUBJECT_CONTEXT_PATHS = Symbol('CASL_SUBJECT_CONTEXT_PATHS');

/**
 * Token for global default field extraction/check configuration used during
 * instance-level permission checks.
 */
export const CASL_FIELDS_FROM_REQUEST = Symbol('CASL_FIELDS_FROM_REQUEST');

/**
 * Token for providing a custom {@link LoggerService} to {@link CaslBehavior}.
 */
export const CASL_BEHAVIOR_LOGGER = Symbol('CASL_BEHAVIOR_LOGGER');

/**
 * Unique symbol key used in `context.items` to store/retrieve the {@link CaslUserContext}.
 * If no {@link IUserContextResolver} is registered, the behavior looks up
 * this key directly in the items bag.
 *
 * @example
 * ```ts
 * context.items.set(CASL_USER_CONTEXT_KEY, { id: 'usr_1', roles: ['admin'] });
 * ```
 */
export const CASL_USER_CONTEXT_KEY = Symbol('CASL_USER_CONTEXT_KEY');

/**
 * Unique symbol key used in `context.items` to store the resolved CASL ability after
 * the behavior runs. Downstream behaviors or handlers can retrieve it.
 *
 * @example
 * ```ts
 * const ability = context.items.get(CASL_ABILITY_KEY) as AppAbility | undefined;
 * ```
 */
export const CASL_ABILITY_KEY = Symbol('CASL_ABILITY_KEY');

/**
 * Built-in CASL keyword subjects.
 */
export const CASL_SUBJECTS = {
  /** Wildcard subject matching any entity type. */
  ALL: 'all',
} as const;

export type CaslSubject = (typeof CASL_SUBJECTS)[keyof typeof CASL_SUBJECTS];

/**
 * Standard CASL actions, including built-in wildcard and standard CRUD verbs.
 */
export const CASL_ACTIONS = {
  /** Built-in CASL wildcard action matching any operation. */
  MANAGE: 'manage',
  /** Standard CRUD create action. */
  CREATE: 'create',
  /** Standard CRUD read/retrieve action. */
  READ: 'read',
  /** Standard CRUD update action. */
  UPDATE: 'update',
  /** Standard CRUD delete action. */
  DELETE: 'delete',
} as const;

export type CaslAction = (typeof CASL_ACTIONS)[keyof typeof CASL_ACTIONS];
