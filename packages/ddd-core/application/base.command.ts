/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { definedFields, defineHidden } from './request-fields.helper';

/**
 * Base class for application CQRS commands.
 *
 * Encapsulates non-enumerable session/authentication metadata and reports which
 * of a declared set of fields this command actually carries, via
 * {@link getUpdateFields}.
 */
// biome-ignore lint/suspicious/noExplicitAny: generic session user default
export abstract class BaseCommand<TSessionUser = any> {
  public declare readonly sessionUser?: TSessionUser;

  constructor(sessionUser?: TSessionUser) {
    if (sessionUser !== undefined)
      defineHidden(this, 'sessionUser', sessionUser);
  }

  /**
   * Serializes enumerable command payload fields to a plain object.
   *
   * Non-enumerable metadata such as `sessionUser` is excluded, and fields whose
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
   * explicit list owned by the command type. With `@nestjs-pipeline/zod`, mark
   * the fields in the schema with `.apply(updatable)`, and `createCommand()`
   * lists them as the static `updatableFields`.
   *
   * @param updatableFields - Allowed updatable field names for this command.
   * @returns Only fields present in the current command payload.
   *
   * @example
   * ```ts
   * export class UpdateUserCommand extends createCommand(
   *   z.object({
   *     id: z.uuid(),
   *     username: z.string().trim().min(3).apply(updatable).optional(),
   *   }),
   *   BaseCommand,
   * ) {}
   *
   * const fields = command.getUpdateFields(UpdateUserCommand.updatableFields);
   * authorizer.authorize('update', user, fields);
   * ```
   */
  getUpdateFields(updatableFields: readonly string[]): string[] {
    return updatableFields.filter(
      (field) => (this as Record<string, unknown>)[field] !== undefined,
    );
  }
}
