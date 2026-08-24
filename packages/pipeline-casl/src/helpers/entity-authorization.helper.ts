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

import { ForbiddenError, subject as caslSubject } from '@casl/ability';
import { ForbiddenException } from '@nestjs/common';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { CASL_ABILITY_KEY } from '../constants/tokens';
import type { AppAbility } from '../types/casl.types';

/**
 * Retrieve the {@link AppAbility} that {@link CaslBehavior} stored for the
 * current request.
 *
 * `CaslBehavior` runs **before** the handler and only sees the command/query
 * payload — it cannot evaluate conditions that depend on the *persisted* state
 * of the target entity (e.g. "the user being edited belongs to my department").
 * Handlers therefore need to perform a second, instance-level check against the
 * entity they just loaded. This helper exposes the already-built ability so the
 * handler does not have to rebuild it.
 *
 * Pass the pipeline {@link IPipelineContext} explicitly when you have it,
 * otherwise the ability is read from the ambient pipeline async store, which is
 * populated automatically for every pipelined handler.
 *
 * @returns The request's ability, or `undefined` when CASL did not run for this
 *          handler (e.g. no `rules`, `prebuiltAbility`, or `skipCheck`).
 */
export function getCaslAbility(
  context?: IPipelineContext,
): AppAbility | undefined {
  const ctx = context ?? pipelineStore.getStore();
  return ctx?.items.get(CASL_ABILITY_KEY) as AppAbility | undefined;
}

/**
 * A single entity-level permission requirement evaluated against a concrete,
 * already-loaded domain entity (not the request payload).
 */
export interface EntityPermissionCheck {
  /** The action to check (e.g. `'update'`, `'delete'`). */
  action: string;
  /** The subject type the entity represents (e.g. `'User'`). */
  subject: string;
  /**
   * The loaded entity instance (or its snapshot). Its attributes are matched
   * against the capability conditions — this is what makes
   * ownership/department/tenant rules actually enforceable.
   */
  entity: Record<string, unknown>;
  /**
   * Optional field names being mutated. When provided, each field is checked
   * individually so field-level grants/denials (e.g. allow `username`, deny
   * `salary`) are honoured.
   */
  fields?: string[];
}

/**
 * Assert that the given ability permits an action against a concrete entity
 * instance, throwing a NestJS {@link ForbiddenException} otherwise.
 *
 * This is the recommended second phase of CASL authorization for mutations:
 *
 * 1. {@link CaslBehavior} performs the cheap type-level / request-payload check
 *    before the handler runs (fail fast, no DB round-trip).
 * 2. The handler loads the target entity and calls
 *    {@link assertEntityPermission} so conditions that depend on the entity's
 *    persisted attributes are enforced.
 *
 * @example Supervisor may only update users in their own department
 * ```ts
 * const ability = getCaslAbility();
 * if (ability) {
 *   assertEntityPermission(ability, {
 *     action: 'update',
 *     subject: 'User',
 *     entity: user.toJSON(),
 *     fields: changedFields,
 *   });
 * }
 * ```
 *
 * @throws {ForbiddenException} When the ability denies the action (optionally
 *         for a specific field) on the entity.
 */
export function assertEntityPermission(
  ability: AppAbility,
  check: EntityPermissionCheck,
): void {
  const typedSubject = caslSubject(
    check.subject,
    { ...check.entity },
  ) as unknown as string;

  const guard = ForbiddenError.from(ability);

  try {
    if (check.fields && check.fields.length > 0) {
      for (const field of check.fields) {
        guard.throwUnlessCan(check.action, typedSubject, field);
      }
    } else {
      guard.throwUnlessCan(check.action, typedSubject);
    }
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw new ForbiddenException(
        'Access denied — insufficient permissions.',
      );
    }
    throw error;
  }
}
