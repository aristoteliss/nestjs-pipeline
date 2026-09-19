/* Copyright (C) 2026-present Aristotelis — see repository license. */
/**
 * Configuration mapping a database unique constraint failure to an application domain exception.
 */
export interface UniqueConstraintMapping<TEntity> {
  /** PostgreSQL constraint or unique index name (e.g. `'users_email_unique'`). */
  constraint: string;
  /** SQLite table and column identity (e.g. `'users.email'`). */
  columns: string;
  /** Factory creating the domain exception from the failing entity instance. */
  error(entity: TEntity): Error;
}

/** Only translate an identified constraint; unrelated errors retain their identity. */
function matchesUniqueConstraint(
  error: unknown,
  mapping: UniqueConstraintMapping<unknown>,
): boolean {
  if (!error || typeof error !== 'object') return false;
  const details = error as {
    code?: unknown;
    constraint?: unknown;
    message?: unknown;
  };
  if (details.code === '23505' && details.constraint === mapping.constraint)
    return true;
  if (typeof details.message !== 'string') return false;
  // MikroORM driver exceptions may retain the native diagnostic only in message.
  return (
    details.message.includes(
      `violates unique constraint "${mapping.constraint}"`,
    ) ||
    details.message
      .split('\n')
      .some(
        (line) =>
          line.trim() === `UNIQUE constraint failed: ${mapping.columns}` ||
          line
            .trim()
            .endsWith(`: UNIQUE constraint failed: ${mapping.columns}`),
      )
  );
}

/**
 * Method decorator that intercepts persistence failures from the wrapped method and
 * translates identifiable database unique constraint violations into domain exceptions.
 *
 * ### Error Matching Mechanics
 * - **PostgreSQL**: Matches driver error code `23505` with `constraint === mapping.constraint`,
 *   or driver message containing `violates unique constraint "${mapping.constraint}"`.
 * - **SQLite / libSQL**: Matches driver message lines containing `UNIQUE constraint failed: ${mapping.columns}`.
 * - **Residual translation**: Any error not matching a configured constraint is passed to the
 *   optional `otherwise` translator, which is the declarative place to convert driver/network
 *   failures into the neutral {@link TransientOperationError} retry signal.
 * - **Passthrough**: Without `otherwise` — or when `otherwise` returns the error unchanged — the
 *   error is rethrown with its original identity, class, and stack trace completely preserved.
 *
 * Use `otherwise` for application-level translation of unmatched driver or
 * network failures. Keep persistence translation in this decorator so the
 * lifecycle order relative to `@AcknowledgePersisted` and `@Cache` remains
 * explicit in the decorator stack.
 *
 * ### Canonical Decorator Ordering
 * Always stack decorators in this outermost-to-innermost order:
 * 1. `@Cache(...)` — Best-effort cache synchronization after acknowledgment.
 * 2. `@AcknowledgePersisted(...)` — Acknowledges version baseline on successful write.
 * 3. `@MapPersistenceErrors(...)` — Translates low-level DB driver errors to domain exceptions.
 *
 * @param options Configuration object with an `entity` extractor function and a list of unique constraint mappings.
 *
 * @example Mapping unique constraints in a create repository
 * ```typescript
 * @Injectable()
 * export class CreateUserCommandRepository extends CommandRepository<User, UserSnapshot> {
 *   @Cache<User, UserSnapshot>((u) => `users:${u.id}`, null, (u) => [`users:email:${u.email}`])
 *   @AcknowledgePersisted<[User]>({ entity: ([user]) => user })
 *   @MapPersistenceErrors<[User], User>({
 *     entity: ([user]) => user,
 *     unique: [
 *       {
 *         constraint: 'users_email_unique',
 *         columns: 'users.email',
 *         error: (user) => new UniqueEmailException(user),
 *       },
 *     ],
 *   })
 *   async save(user: User): Promise<UserSnapshot> {
 *     const created = this.store.em.create(User, user);
 *     this.store.em.persist(created);
 *     await this.store.em.flush();
 *     return created.toJSON();
 *   }
 * }
 * ```
 */
export function MapPersistenceErrors<
  TArgs extends unknown[],
  TEntity,
>(options: {
  entity: (args: TArgs) => TEntity;
  unique: readonly UniqueConstraintMapping<TEntity>[];
  /**
   * Optional translator applied to any error that did not match a unique constraint
   * mapping. Return the error unchanged to preserve its identity, or return a
   * replacement to express it in application terms.
   *
   * The canonical use is transient-failure classification, so that retry policies
   * consume `TransientOperationError` rather than driver codes:
   *
   * ```typescript
   * otherwise: (error, user) => mapPersistenceError(error, `deleting User ${user.id}`),
   * ```
   *
   * Deliberate domain errors thrown inside the method (`ConcurrencyConflictError`,
   * `EntityNotFoundException`) also pass through this hook. `mapPersistenceError`
   * returns non-transient errors unchanged, so no explicit re-throw guard is needed.
   */
  otherwise?: (error: unknown, entity: TEntity) => unknown;
}) {
  return <TResult>(
    _target: object,
    _key: string | symbol,
    descriptor: TypedPropertyDescriptor<(...args: TArgs) => Promise<TResult>>,
  ): void => {
    const original = descriptor.value;
    if (typeof original !== 'function')
      throw new TypeError('Persistence decorators require a method.');
    descriptor.value = async function (...args: TArgs): Promise<TResult> {
      try {
        return await original.apply(this, args);
      } catch (error) {
        const mapping = options.unique.find((candidate) =>
          matchesUniqueConstraint(error, candidate),
        );
        if (mapping) throw mapping.error(options.entity(args));
        if (options.otherwise)
          throw options.otherwise(error, options.entity(args));
        throw error;
      }
    };
  };
}
