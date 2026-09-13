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

import type { UserCapabilities } from '@nestjs-pipeline/casl';
import type { Auth } from '../../domain/models/auth.entity';

/**
 * Application result produced by {@link CreateAuthHandler}.
 *
 * Carries the newly persisted {@link Auth} aggregate root along with
 * authenticated identity and capability metadata needed by downstream callers.
 */
export interface CreateAuthResult {
  readonly aggregate: Auth;
  readonly id: string;
  readonly tenant: string;
  readonly email: string;
  readonly department?: string | null;
  readonly capabilities?: UserCapabilities;
  readonly token: string;
  readonly expiresAt?: number;
  readonly exp?: number;
}
