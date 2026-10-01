/* Copyright (C) 2026-present Aristotelis — see repository license. */
import {
  type IPersistenceDialect,
  persistenceDialect,
} from '../persistence-dialect.js';

/**
 * Domain errors per violated unique constraint, keyed by the entity property the
 * constraint covers. A multi-column constraint has no single property: key it by
 * its declared name, passed as `TConstraint` from a constant declared beside the
 * ORM mapping. No database name or column string appears in a repository.
 */
export type UniqueErrors<TEntity, TConstraint extends string = never> = {
  readonly [K in Extract<keyof TEntity, string> | TConstraint]?: (
    entity: TEntity,
  ) => Error;
};

/**
 * Method decorator that intercepts persistence failures from the wrapped method and
 * translates identifiable database unique constraint violations into domain exceptions.
 *
 * ### Error Matching Mechanics
 * - **Unique violations**: the persistence dialect ({@link IPersistenceDialect}) names the
 *   violated constraint by the entity property it covers; `unique[key]` builds the
 *   domain error. The dialect comes from `options.dialect`, else from
 *   {@link setPersistenceDialect}. A method that declares `unique` with no dialect
 *   available throws a `TypeError` before it runs, so a violation never escapes as a
 *   raw driver error.
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
 * @param options The `entity` extractor, the `unique` errors, an optional `dialect`
 *   overriding the registered one (for a repository on another store), and an
 *   optional `otherwise` translator.
 *
 * @example Mapping unique constraints in a create repository
 * ```typescript
 * @Injectable()
 * export class CreateUserCommandRepository extends CommandRepository<User, UserSnapshot> {
 *   @Cache<User, UserSnapshot>((u) => `users:${u.id}`, null, (u) => [`users:email:${u.email}`])
 *   @AcknowledgePersisted<[User]>({ entity: ([user]) => user })
 *   @MapPersistenceErrors<[User], User>({
 *     entity: ([user]) => user,
 *     unique: { email: (user) => new UniqueEmailException(user) },
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
  TConstraint extends string = never,
  TThis = unknown,
>(options: {
  entity: (args: TArgs) => TEntity;
  unique?: UniqueErrors<TEntity, TConstraint>;
  dialect?: IPersistenceDialect;
  /**
   * Optional translator applied to any error that did not match a unique constraint
   * mapping. Return the error unchanged to preserve its identity, or return a
   * replacement to express it in application terms.
   *
   * The canonical use is transient-failure classification with
   * `mapPersistenceError`, so that retry policies consume
   * `TransientOperationError` rather than driver codes:
   *
   * ```typescript
   * otherwise: (error, user) => mapPersistenceError(error, `deleting User ${user.id}`),
   * ```
   *
   * Deliberate domain errors thrown inside the method (`ConcurrencyConflictError`,
   * `EntityNotFoundException`) also pass through this hook. `mapPersistenceError`
   * returns non-transient errors unchanged, so no explicit re-throw guard is needed.
   *
   * Written as a method, it runs with `this` bound to the repository instance
   * (typed by `TThis`), for a message that names instance state.
   */
  otherwise?: (this: TThis, error: unknown, entity: TEntity) => unknown;
}) {
  return <TResult>(
    _target: object,
    _key: string | symbol,
    descriptor: TypedPropertyDescriptor<(...args: TArgs) => Promise<TResult>>,
  ): void => {
    const original = descriptor.value;
    if (typeof original !== 'function')
      throw new TypeError('Persistence decorators require a method.');
    const unique = options.unique ?? {};
    const hasUnique = Object.keys(unique).length > 0;
    descriptor.value = async function (...args: TArgs): Promise<TResult> {
      const dialect = options.dialect ?? persistenceDialect();
      if (hasUnique && !dialect) {
        throw new TypeError(
          'Unique-constraint mapping needs a persistence dialect: call setPersistenceDialect() or pass { dialect }.',
        );
      }
      try {
        return await original.apply(this, args);
      } catch (error) {
        const entity = options.entity(args);
        const key = hasUnique
          ? dialect?.uniqueViolation(error, entity as object)
          : undefined;
        const toError =
          key === undefined
            ? undefined
            : (unique as Record<string, (entity: TEntity) => Error>)[key];
        if (toError) throw toError(entity);
        if (options.otherwise)
          throw options.otherwise.call(this as TThis, error, entity);
        throw error;
      }
    };
  };
}
