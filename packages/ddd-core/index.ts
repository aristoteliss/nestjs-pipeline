/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Convenience barrel re-exporting every layer.
 *
 * Prefer the layered entry points — `@cqrs-ddd/core/domain` and
 * `.../application` — in domain and CQRS code so the layering is expressed by
 * the import itself rather than only by convention.
 */

export * from './application/index.js';
export * from './domain/index.js';
export * from './http/index.js';
export * from './persistence/index.js';
export * from './types/Method.type.js';
