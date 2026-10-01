/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * ORM-neutral persistence building blocks: the repository base classes, the
 * lifecycle decorators, the cache protocol and its in-memory adapter.
 *
 * Repository *ports* are exported from `@cqrs-ddd/core/application`; handlers
 * should import those and leave this entry point to the adapters. ORM adapters
 * live in their own packages, such as `@cqrs-ddd/mikro-orm`.
 */

export * from './cache/cache-logger.js';
export * from './cache/memory.cache.js';
export * from './command-repository.abstract.js';
export * from './decorators/acknowledge-persisted.decorator.js';
export * from './decorators/cache.decorator.js';
export * from './decorators/from-cache.decorator.js';
export * from './decorators/map-persistence-errors.decorator.js';
export * from './decorators/persisted-write.decorator.js';
export * from './helpers/cache-barrier.helper.js';
export * from './helpers/cache-key.helper.js';
export * from './helpers/cache-snapshot.helper.js';
export * from './helpers/cache-version.helper.js';
export * from './persistence-dialect.js';
export * from './query-repository.abstract.js';
