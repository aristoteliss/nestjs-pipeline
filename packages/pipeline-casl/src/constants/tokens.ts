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
 * Token for providing a custom {@link LoggerService} to {@link CaslBehavior}.
 */
export const CASL_BEHAVIOR_LOGGER = Symbol('CASL_BEHAVIOR_LOGGER');

/**
 * Key used in `context.items` to store/retrieve the {@link CaslUserContext}.
 * If no {@link IUserContextResolver} is registered, the behavior looks up
 * this key directly in the items bag.
 */
export const CASL_USER_CONTEXT_KEY = 'casl:user';

/**
 * Key used in `context.items` to store the resolved CASL ability after
 * the behavior runs. Downstream behaviors or handlers can retrieve it.
 */
export const CASL_ABILITY_KEY = 'casl:ability';
