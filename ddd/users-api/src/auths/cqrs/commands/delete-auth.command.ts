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

import { BaseCommand } from '@common/cqrs/commands/base.command';
import type { SessionUser } from '@common/types/SessionUser';

/**
 * Command requesting revocation of an authenticated session.
 *
 * Transports the calling session user and optional bearer token string so that
 * the handler can retrieve and delete the exact persistent `Auth` aggregate.
 */
export class DeleteAuthCommand extends BaseCommand {
  public readonly token?: string;

  constructor(sessionUser?: SessionUser, token?: string) {
    super(sessionUser);
    this.token = token;
  }
}
