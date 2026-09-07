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

import { DomainException } from './domain.exception';

/**
 * Framework-neutral lookup failure for an aggregate or entity required by a use case.
 *
 * Application and persistence layers may throw this exception without importing
 * HTTP/Nest presentation semantics. Transport adapters are responsible for mapping
 * it to their own not-found representation (HTTP 404 in the users-api).
 */
export class EntityNotFoundException extends DomainException {
  constructor(
    readonly entityName: string,
    readonly entityId?: string,
  ) {
    super(`${entityName} not found`);
  }
}
