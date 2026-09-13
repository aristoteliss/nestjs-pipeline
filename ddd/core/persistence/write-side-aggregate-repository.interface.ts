/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import type { ICommandRepository } from './command-repository.interface';

/**
 * Write-side repository contract for commands that mutate an existing aggregate.
 *
 * `findById()` must read authoritative persistence and must not use a read-side
 * result cache. Adapters backed by an ORM identity map should force a refresh so
 * optimistic-concurrency checks are based on current persisted state.
 */
export interface IWriteSideAggregateRepository<
  TEntity,
  TSnapshot,
  TResult = unknown,
  TId = string,
> extends ICommandRepository<TEntity, TResult> {
  /** Loads the current authoritative snapshot for a mutating command. */
  findById(id: TId): Promise<TSnapshot | null>;
}
