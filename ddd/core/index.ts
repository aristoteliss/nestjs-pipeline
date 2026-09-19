/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Convenience barrel re-exporting every layer.
 *
 * It reaches `./persistence`, and therefore MikroORM. Prefer the layered entry
 * points — `@nestjs-pipeline/ddd-core/domain` and `.../application` — in domain
 * and CQRS code so the layering is expressed by the import itself rather than
 * only by convention.
 */

export * from './application/index';
export * from './domain/index';
export * from './persistence/index';
export * from './types/Method.type';
