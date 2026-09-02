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

import type { RootEntitySnapshot } from './root-entity-snapshot.interface';

/**
 * Global symbol token for entity authorizer dependency injection.
 */
export const ENTITY_AUTHORIZER = Symbol.for('ENTITY_AUTHORIZER');

/**
 * Pluggable authorizer contract used by domain entities to evaluate access rules.
 */
export interface IEntityAuthorizer {
  can(
    action: string,
    subject: string,
    entity: Record<string, unknown>,
    field?: string,
  ): boolean;
}

/**
 * Common contract for domain entities supporting instance-level authorization and field masking.
 */
export interface IAuthorizeEntity<
  TSnapshot extends Partial<RootEntitySnapshot>,
> {
  /**
   * Authorizes the entity against the given or default authorizer.
   *
   * @param action The action being executed (e.g. `'read'`, `'create'`, `'update'`, `'delete'`).
   * @param fields Optional list of mutated/accessed fields to validate.
   * @param authorizer Optional explicit authorizer instance.
   * @returns The authorized entity snapshot (with unauthorized fields masked when action is `'read'`).
   * @throws {UnauthorizedActionException} when authorization is denied.
   */
  authorize(
    action: 'create' | 'read' | 'update' | 'delete' | string,
    fields?: (keyof TSnapshot | string)[],
    authorizer?: IEntityAuthorizer,
  ): Partial<TSnapshot>;
}
