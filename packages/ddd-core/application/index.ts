/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Application-layer primitives and the ports handlers depend on. The ports, in
 * `ports/`, are the contracts a CQRS handler depends on; their adapters stay
 * behind `@cqrs-ddd/core/persistence` or in an adapter package.
 */

export * from './base.command';
export * from './base.query';
export * from './command-base.handler';
export * from './ports/cache.port';
export * from './ports/command-repository.port';
export * from './ports/domain-event-publisher.port';
export * from './ports/query-repository.port';
export * from './ports/write-side-aggregate-repository.port';
export * from './query.options';
export * from './tenant-resolver';
