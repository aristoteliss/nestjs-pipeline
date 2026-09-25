/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Application-layer primitives and the ports handlers depend on.
 *
 * Repository interfaces live here rather than under `persistence` because they
 * are ports: a CQRS handler depends on the contract, while the adapter that
 * implements it — and the ORM it uses — stays behind
 * `@cqrs-ddd/core/persistence`.
 */

export * from '../persistence/cache.interface';
export * from '../persistence/command-repository.interface';
export * from '../persistence/query-repository.interface';
export * from '../persistence/write-side-aggregate-repository.interface';
export * from './base.command';
export * from './base.query';
export * from './command-base.handler';
export * from './domain-event-publisher.port';
export * from './query.options';
export * from './tenant-resolver';
