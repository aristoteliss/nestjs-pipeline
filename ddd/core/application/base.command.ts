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
   * Returns which of `mutableFields` this command actually carries.
   *
   * The caller states the field set. It used to be derived from
   * `Object.keys(this)` minus an exclude list, which meant the field-level
   * authorization surface was whatever the schema happened to contain: adding a
   * property to a command's Zod schema silently added a field that CASL was
   * asked to authorize, and removing one silently stopped a check without any
   * rule changing. Declaring the set makes that an edit someone has to make.
   *
   * A field is reported only when its value is not `undefined`, so an optional
   * property the caller omitted is not authorized as if it were being written.
   * `null` counts as provided — clearing a field is a mutation.
   *
   * @param mutableFields - The fields subject to field-level authorization.
   * @returns Those of them present on this command.
   */
  getUpdateFields(mutableFields: readonly string[]): string[] {
    return mutableFields.filter(
      (field) => (this as Record<string, unknown>)[field] !== undefined,
    );
  }
}
