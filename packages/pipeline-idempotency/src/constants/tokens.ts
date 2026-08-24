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
 * Injection token holding the
 * {@link import('../interfaces/idempotency-store.interface').IdempotencyStore}
 * that idempotency records are read from / written to, supplied via
 * {@link IdempotencyModule.forRoot} / {@link IdempotencyModule.forRootAsync}.
 */
export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE');

/**
 * Injection token holding the module-wide default
 * {@link import('../interfaces/idempotency-options.interface').IdempotencyBehaviorOptions}
 * merged under each handler's per-pipeline configuration.
 */
export const IDEMPOTENCY_DEFAULT_OPTIONS = Symbol(
  'IDEMPOTENCY_DEFAULT_OPTIONS',
);

/** Default time-to-live for an idempotency key: 24 hours, in milliseconds. */
export const DEFAULT_IDEMPOTENCY_TTL_MS = 86_400_000;
