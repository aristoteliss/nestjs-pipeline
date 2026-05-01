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

export abstract class SessionCommand {
  public readonly sessionUser?: SessionUser;

  constructor(sessionUser?: SessionUser) {
    this.sessionUser = sessionUser ?? getSessionUserFromStore();
  }
}
