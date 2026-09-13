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

import type { ICommand } from '@nestjs/cqrs';

/**
 * Base class for application CQRS commands.
 *
 * Encapsulates non-enumerable session/authentication metadata and provides
 * dynamic introspection of payload fields targeted for update via {@link getUpdateFields}.
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
   * Returns the names of all payload fields explicitly provided in this command,
   * excluding identifier and metadata keys.
   *
   * @param exclude - Array of property keys to exclude (defaults to `['id']`).
   * @returns Array of field names targeted for mutation.
   */
  getUpdateFields(exclude: string[] = ['id']): string[] {
    const excluded = new Set(exclude);
    return Object.keys(this).filter(
      (key) =>
        !excluded.has(key) &&
        (this as Record<string, unknown>)[key] !== undefined,
    );
  }
}
