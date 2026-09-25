/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Persistence adapters and their helpers.
 *
 * This is the only entry point that reaches MikroORM, which is therefore an
 * optional peer dependency of the package. Repository *ports* are exported from
 * `@nestjs-pipeline/ddd-core/application`; handlers should import those and
 * leave this entry point to the adapters.
 */

export * from './assert-autocommit';
export * from './cache/cache-entry';
export * from './cache/memory.cache';
export * from './cache/mikro-orm.cache';
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
export * from './helpers/cache-snapshot.helper';
export * from './helpers/cache-version.helper';
export * from './helpers/filter-cache-key.helper';
export * from './is-transient-persistence-error';
export * from './mikro-orm-write-side.command-repository';
export * from './optimistic-delete';
export * from './optimistic-update';
export * from './query-repository.abstract';
export * from './query-repository.interface';
export * from './root-entity.properties';
export * from './types/unix-timestamp.type';
export * from './write-side-aggregate-repository.interface';
