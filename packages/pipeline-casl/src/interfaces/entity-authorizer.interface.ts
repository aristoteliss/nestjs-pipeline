/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type {
  AuthorizerSelectOptions,
  Projected,
  SelectedProjection,
} from '../types/casl.types';

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

  /**
   * Authorizes an action on a subject/entity, returning the authorized entity or field-projected snapshot.
   */
  authorize<T = unknown>(
    action: string,
    subject: object | string,
    fields?: string[],
  ): T;

  /**
   * Authorizes a read on an entity with an explicit field selection allowlist.
   */
  authorize<TEntity extends object, K extends keyof TEntity & string>(
    action: 'read',
    subject: TEntity,
    options: AuthorizerSelectOptions<K>,
  ): SelectedProjection<TEntity, K>;

  /**
   * Projects candidate data against an authoritative loaded entity subject.
   */
  project<TCandidate extends object>(
    action: string,
    subject: object | string,
    candidate: TCandidate,
  ): Projected<TCandidate>;
}
