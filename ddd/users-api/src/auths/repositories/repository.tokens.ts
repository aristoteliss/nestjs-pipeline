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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
 */

export const COMMAND_REPOSITORY = {
  createAuth: Symbol('createAuth'),
  deleteAuth: Symbol('deleteAuth'),
} as const;

export const QUERY_REPOSITORY = {
  getUserCapabilities: Symbol('getUserCapabilities'),
} as const;
