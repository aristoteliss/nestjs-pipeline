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
 * Injection token holding the {@link import('../interfaces/dead-letter-transport.interface').DeadLetterTransport}
 * that failed requests are forwarded to, supplied via
 * {@link DeadLetterModule.forRoot} / {@link DeadLetterModule.forRootAsync}.
 */
export const DEAD_LETTER_TRANSPORT = Symbol('DEAD_LETTER_TRANSPORT');

/**
 * Injection token holding the module-wide default
 * {@link import('../interfaces/dead-letter-options.interface').DeadLetterBehaviorOptions}
 * merged under each handler's per-pipeline configuration.
 */
export const DEAD_LETTER_DEFAULT_OPTIONS = Symbol(
  'DEAD_LETTER_DEFAULT_OPTIONS',
);
