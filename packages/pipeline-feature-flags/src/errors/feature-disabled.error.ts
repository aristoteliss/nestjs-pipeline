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
 * Thrown by {@link FeatureFlagBehavior} when a handler is gated behind a flag
 * that resolves to disabled and no `fallback` was configured.
 *
 * Map it to an HTTP status in an exception filter if you expose gated handlers
 * over HTTP (e.g. `404 Not Found` to hide the feature, or `403 Forbidden`).
 */
export class FeatureDisabledError extends Error {
  /** The flag key that gated the request. */
  readonly flag: string;
  /** The request that was blocked, e.g. `CreateUserCommand`. */
  readonly requestName: string;

  constructor(flag: string, requestName: string) {
    super(`Feature "${flag}" is disabled for ${requestName}`);
    this.name = 'FeatureDisabledError';
    this.flag = flag;
    this.requestName = requestName;
  }
}
