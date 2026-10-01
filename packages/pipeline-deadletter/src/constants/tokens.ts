/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Injection token holding the {@link DeadLetterTransport}
 * that failed requests are forwarded to, supplied via
 * {@link DeadLetterModule.forRoot} / {@link DeadLetterModule.forRootAsync}.
 */
export const DEAD_LETTER_TRANSPORT = Symbol('DEAD_LETTER_TRANSPORT');

/**
 * Injection token holding the module-wide default
 * {@link DeadLetterBehaviorOptions}
 * merged under each handler's per-pipeline configuration.
 */
export const DEAD_LETTER_DEFAULT_OPTIONS = Symbol(
  'DEAD_LETTER_DEFAULT_OPTIONS',
);
