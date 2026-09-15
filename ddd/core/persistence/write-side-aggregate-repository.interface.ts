/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ICommandRepository } from './command-repository.interface';

/**
 * Write-side repository contract for commands that mutate an existing aggregate.
 *
 * `findById()` must read authoritative persistence and must not use a read-side
 * result cache. Adapters backed by an ORM identity map should force a refresh so
 * optimistic-concurrency checks are based on current persisted state.
 */
export interface IWriteSideAggregateRepository<TEntity, TId = string>
  extends ICommandRepository<TEntity, unknown> {
  /** Loads the current authoritative aggregate for a mutating command. */
  findById(id: TId): Promise<TEntity | null>;
}
