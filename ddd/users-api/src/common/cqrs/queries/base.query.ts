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

import { getSessionUserFromStore } from '@common/context/session-user.store';
import { SessionUser } from '@common/types/SessionUser';
import { IQueryOptions } from '@nestjs-pipeline/ddd-core/application/query.options';

export abstract class BaseQuery implements IQueryOptions {
  public declare readonly hydrate?: boolean;
  public declare readonly sessionUser?: SessionUser;

  constructor(options?: Partial<IQueryOptions>, sessionUser?: SessionUser) {
    // Query options and authentication context are pipeline metadata rather
    // than request payload. Keep them non-enumerable so payload validation and
    // cache-key serialization do not strip or include them.
    Object.defineProperties(this, {
      hydrate: {
        value: options?.hydrate ?? false,
        enumerable: false,
      },
      sessionUser: {
        value: sessionUser ?? getSessionUserFromStore(),
        enumerable: false,
      },
    });
  }
}
