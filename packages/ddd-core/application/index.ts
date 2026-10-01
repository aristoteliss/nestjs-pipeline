/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Application-layer primitives and the ports handlers depend on. The ports, in
 * `ports/`, are the contracts a CQRS handler depends on; their adapters stay
 * behind `@cqrs-ddd/core/persistence` or in an adapter package.
 */

export * from './base.command.js';
export * from './base.query.js';
export * from './command-base.handler.js';
export * from './ports/cache.port.js';
export * from './ports/command-repository.port.js';
export * from './ports/domain-event-publisher.port.js';
export * from './ports/query-repository.port.js';
export * from './ports/write-side-aggregate-repository.port.js';
export * from './query.options.js';
export * from './tenant-resolver.js';
