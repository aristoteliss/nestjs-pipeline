/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * ORM-neutral persistence building blocks: the repository base classes, the
 * lifecycle decorators, the cache protocol and its in-memory adapter.
 *
 * Repository *ports* are exported from `@cqrs-ddd/core/application`; handlers
 * should import those and leave this entry point to the adapters. ORM adapters
 * live in their own packages, such as `@cqrs-ddd/mikro-orm`.
 */

export * from './cache/memory.cache';
export * from './cache.interface';
export * from './cache-logger';
export * from './command-repository.abstract';
export * from './command-repository.interface';
export * from './decorators/acknowledge-persisted.decorator';
export * from './decorators/Cache';
export * from './decorators/FromCache';
export * from './decorators/map-persistence-errors.decorator';
export * from './decorators/persisted-write.decorator';
export * from './helpers/cache-barrier.helper';
export * from './helpers/cache-key.helper';
export * from './helpers/cache-logger.helper';
export * from './helpers/cache-snapshot.helper';
export * from './helpers/cache-version.helper';
export * from './is-transient-persistence-error';
export * from './query-repository.abstract';
export * from './query-repository.interface';
export * from './write-side-aggregate-repository.interface';
