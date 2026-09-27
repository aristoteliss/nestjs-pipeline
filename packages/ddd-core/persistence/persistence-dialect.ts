/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Reads which unique constraint a persistence error violated. Core declares the
 * contract and knows no database; an adapter package implements it, such as
 * `MikroOrmDialect` of `@cqrs-ddd/mikro-orm`.
 */
export interface IPersistenceDialect {
  /**
   * The key of the unique constraint `error` violated while writing `entity`:
   * the entity property it covers, or the declared name of a multi-column
   * constraint. `undefined` when `error` is not a unique violation, or names a
   * constraint the dialect does not know.
   */
  uniqueViolation(error: unknown, entity: object): string | undefined;
}

let registered: IPersistenceDialect | undefined;

/**
 * Registers the dialect that `@MapPersistenceErrors` and `@PersistedWrite` use
 * when their options name none. Call it once at the composition root, after
 * the ORM is initialized; `undefined` removes it.
 *
 * @example
 * ```ts
 * setPersistenceDialect(new MikroOrmDialect(orm));
 * ```
 */
export function setPersistenceDialect(
  dialect: IPersistenceDialect | undefined,
): void {
  registered = dialect;
}

/**
 * The registered dialect, or `undefined`.
 *
 * @example
 * ```ts
 * const dialect = options.dialect ?? persistenceDialect();
 * ```
 */
export function persistenceDialect(): IPersistenceDialect | undefined {
  return registered;
}
