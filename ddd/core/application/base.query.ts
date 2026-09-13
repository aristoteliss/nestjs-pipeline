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

import type { IQueryOptions } from './query.options';

/**
 * Base class for application CQRS queries.
 *
 * Query options and authentication context are pipeline metadata rather than request
 * payload. Keeps them non-enumerable so payload validation and cache-key serialization
 * do not strip or include them.
 */
export abstract class BaseQuery<TSessionUser = unknown>
  implements IQueryOptions
{
  public declare readonly hydrate?: boolean;
  public declare readonly sessionUser?: TSessionUser;

  constructor(options?: Partial<IQueryOptions>, sessionUser?: TSessionUser) {
    Object.defineProperty(this, 'hydrate', {
      value: options?.hydrate ?? false,
      enumerable: false,
    });
    if (sessionUser !== undefined) {
      Object.defineProperty(this, 'sessionUser', {
        value: sessionUser,
        enumerable: false,
      });
    }
  }
}
