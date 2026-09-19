/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Contract for write-side command repositories.
 *
 * Persists an entity or aggregate state into persistence storage.
 *
 * @typeParam TEntity - The aggregate entity or payload being persisted.
 * @typeParam TResult - The result type returned after persistence (or null on deletion).
 *
 * @example
 * ```ts
 * constructor(
 *   @Inject(COMMAND_REPOSITORY.createUser)
 *   private readonly users: ICommandRepository<User, UserSnapshot>,
 * ) {}
 *
 * await this.users.save(user);
 * ```
 */
export interface ICommandRepository<TEntity = unknown, TResult = unknown> {
  /**
   * Persists the aggregate/payload.
   *
   * Returning `null` is the conventional deletion result used by the DDD cache
   * decorator to trigger eviction/barrier behavior.
   */
  save(entity: TEntity): Promise<TResult | null>;
}
