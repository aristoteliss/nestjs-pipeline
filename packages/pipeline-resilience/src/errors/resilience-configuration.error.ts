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

/**
 * Raised before execution when a declarative handler-level resilience policy is
 * ambiguous or unsafe (for example a side-effectful command retry without an
 * explicit replay-safety acknowledgement).
 */
export class ResilienceConfigurationError extends Error {
  override readonly name = 'ResilienceConfigurationError';

  constructor(
    public readonly requestName: string,
    public readonly requestKind: string,
    public readonly reason: string,
  ) {
    super(
      `Unsafe resilience configuration for ${requestKind} ${requestName}: ${reason}`,
    );
  }
}
