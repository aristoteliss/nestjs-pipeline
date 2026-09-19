/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ICommandRepository } from './command-repository.interface';

/**
 * Write-side repository contract for commands that mutate an existing aggregate.
 *
 * `findById()` must read authoritative persistence and must not use a read-side
 * result cache. Adapters backed by an ORM identity map should force a refresh so
 * optimistic-concurrency checks are based on current persisted state.
 *
 * Use this contract in update/delete command handlers that must authorize and
 * mutate the real aggregate before saving it.
 *
 * @typeParam TEntity - Rehydrated aggregate type.
 * @typeParam TId - Aggregate identifier type.
 *
 * @example
 * ```ts
 * const user = await repository.findById(command.id);
 * if (!user) throw new EntityNotFoundException('User', command.id);
 * authorizer.authorize('update', user);
 * user.update({ department: command.department });
 * await repository.save(user);
 * ```
 */
export interface IWriteSideAggregateRepository<TEntity, TId = string>
  extends ICommandRepository<TEntity, unknown> {
  /**
   * Loads the current authoritative aggregate for a mutating command.
   *
   * @param id - Aggregate identifier.
   * @returns The rehydrated aggregate, or `null` when it does not exist.
   */
  findById(id: TId): Promise<TEntity | null>;
}
