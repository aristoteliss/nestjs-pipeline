/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { definedFields, defineHidden } from './request-fields.helper.js';

/**
 * Base class for application CQRS commands.
 *
 * Encapsulates non-enumerable session/authentication metadata and reports which
 * of a declared set of fields this command actually carries, via
 * {@link getUpdateFields}.
 */
// biome-ignore lint/suspicious/noExplicitAny: generic session principal default
export abstract class BaseCommand<TSessionPrincipal = any> {
  declare public readonly sessionPrincipal?: TSessionPrincipal;
  declare public readonly sessionUser?: TSessionPrincipal;

  constructor(sessionPrincipal?: TSessionPrincipal) {
    if (sessionPrincipal !== undefined) {
      defineHidden(this, 'sessionPrincipal', sessionPrincipal);
      defineHidden(this, 'sessionUser', sessionPrincipal);
    }
  }

  /**
   * Serializes enumerable command payload fields to a plain object.
   *
   * Non-enumerable metadata such as `sessionPrincipal` and `sessionUser` is excluded, and fields whose
   * value is `undefined` are omitted. This makes the result suitable for stable
   * cache/idempotency fingerprinting.
   *
   * @returns The command payload without pipeline/session metadata.
   */
  toJSON(): Record<string, unknown> {
    return definedFields(this);
  }

  /**
   * Returns the declared updatable fields that are actually present on this command.
   *
   * A field counts as present when its value is not `undefined`. `null`
   * therefore counts as an intentional mutation, which is important for nullable
   * fields such as clearing a department.
   *
   * Use this with field-level authorization so the authorization surface is an
   * explicit list owned by the command type.
   *
   * @param updatableFields - Allowed updatable field names for this command.
   * @returns Only fields present in the current command payload.
   *
   * @example
   * ```ts
   * // updatableFields: the fields this command type declares updatable.
   * const fields = command.getUpdateFields(updatableFields);
   * authorizer.authorize('update', user, fields);
   * ```
   */
  getUpdateFields(updatableFields: readonly string[]): string[] {
    return updatableFields.filter(
      (field) => (this as Record<string, unknown>)[field] !== undefined,
    );
  }
}
