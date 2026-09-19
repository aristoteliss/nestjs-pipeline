/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ICommand } from '@nestjs/cqrs';

/**
 * Base class for application CQRS commands.
 *
 * Encapsulates non-enumerable session/authentication metadata and reports which
 * of a declared set of fields this command actually carries, via
 * {@link getUpdateFields}.
 */
// biome-ignore lint/suspicious/noExplicitAny: generic session user default
export abstract class BaseCommand<TSessionUser = any> implements ICommand {
  public declare readonly sessionUser?: TSessionUser;

  constructor(sessionUser?: TSessionUser) {
    if (sessionUser !== undefined) {
      Object.defineProperty(this, 'sessionUser', {
        value: sessionUser,
        enumerable: false,
      });
    }
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
    const json: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this)) {
      if (value !== undefined) {
        json[key] = value;
      }
    }
    return json;
  }

  /**
   * Returns the declared mutable fields that are actually present on this command.
   *
   * A field counts as present when its value is not `undefined`. `null`
   * therefore counts as an intentional mutation, which is important for nullable
   * fields such as clearing a department.
   *
   * Use this with field-level authorization so the authorization surface is an
   * explicit list owned by the command type.
   *
   * @param mutableFields - Allowed mutable field names for this command.
   * @returns Only fields present in the current command payload.
   *
   * @example
   * ```ts
   * export class UpdateUserCommand extends createCommand(UpdateUserSchema, BaseCommand) {
   *   static readonly MUTABLE_FIELDS = ['username', 'department'] as const;
   * }
   *
   * const fields = command.getUpdateFields(UpdateUserCommand.MUTABLE_FIELDS);
   * authorizer.authorize('update', user, fields);
   * ```
   */
  getUpdateFields(mutableFields: readonly string[]): string[] {
    return mutableFields.filter(
      (field) => (this as Record<string, unknown>)[field] !== undefined,
    );
  }
}
