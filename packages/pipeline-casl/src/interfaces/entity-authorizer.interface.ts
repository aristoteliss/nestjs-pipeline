/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Injection token for the entity authorizer provider.
 */
export const ENTITY_AUTHORIZER = Symbol.for('ENTITY_AUTHORIZER');

/**
 * Pluggable authorizer contract for entity-level authorization checks.
 */
export interface IEntityAuthorizer {
  /** Checks an entity instance or subject type, optionally restricted to one field. */
  can(action: string, subject: object | string, field?: string): boolean;
}
