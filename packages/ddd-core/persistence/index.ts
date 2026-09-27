/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * ORM-neutral persistence building blocks: the repository base classes, the
 * lifecycle decorators, the cache protocol and its in-memory adapter.
 *
 * Repository *ports* are exported from `@cqrs-ddd/core/application`; handlers
 * should import those and leave this entry point to the adapters. ORM adapters
 * live in their own packages, such as `@cqrs-ddd/mikro-orm`.
 */

export * from './cache/cache-logger';
export * from './cache/memory.cache';
export * from './command-repository.abstract';
export * from './decorators/acknowledge-persisted.decorator';
export * from './decorators/cache.decorator';
export * from './decorators/from-cache.decorator';
export * from './decorators/map-persistence-errors.decorator';
export * from './decorators/persisted-write.decorator';
export * from './helpers/cache-barrier.helper';
export * from './helpers/cache-key.helper';
export * from './helpers/cache-snapshot.helper';
export * from './helpers/cache-version.helper';
export * from './persistence-dialect';
export * from './query-repository.abstract';
