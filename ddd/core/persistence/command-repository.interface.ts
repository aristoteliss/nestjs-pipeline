/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Contract for write-side command repositories.
 *
 * Persists an entity or aggregate state into persistence storage.
 *
 * @typeParam TEntity - The aggregate entity or payload being persisted.
 * @typeParam TResult - The result type returned after persistence (or null on deletion).
 */
export interface ICommandRepository<TEntity = unknown, TResult = unknown> {
  save(entity: TEntity): Promise<TResult | null>;
}
