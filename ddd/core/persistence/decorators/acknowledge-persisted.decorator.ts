/* Copyright (C) 2026-present Aristotelis — see repository license. */
/**
 * Contract required for aggregates to participate in persistence version acknowledgment.
 *
 * Implemented automatically by {@link RootEntity}.
 */
export interface PersistedAggregate {
  /** The current in-memory aggregate version. */
  readonly version: number;
  /**
   * Advances the persisted version baseline (`_persistedVersion`) to match
   * the durable version written to persistent storage.
   */
  acknowledgePersisted(version: number): void;
}

/**
 * Method decorator that guarantees an aggregate's persisted version baseline is updated
 * upon successful completion of a repository write operation.
 *
 * ### Lifecycle Semantics
 * 1. **Argument Selection**: Extracts the aggregate from method arguments via `options.entity(args)`.
 *    Argument positions are never hardcoded or assumed.
 * 2. **Version Capture**: Captures `const version = entity.version` before awaiting the method.
 * 3. **Execution**: Invokes the wrapped persistence method (e.g. `save(entity)`).
 * 4. **Acknowledgment on Success**: If the promise resolves, invokes `entity.acknowledgePersisted(version)`
 *    to align `_persistedVersion` with the newly written durable version.
 * 5. **Preserved Baseline on Failure**: If the promise rejects (due to concurrency conflict, unique constraint,
 *    or connection error), `acknowledgePersisted()` is skipped, leaving `getExpectedVersion()` at its previous baseline.
 *
 * ### Canonical Decorator Ordering
 * Always stack decorators in this outermost-to-innermost order:
 * 1. `@Cache(...)` — Best-effort cache synchronization after acknowledgment.
 * 2. `@AcknowledgePersisted(...)` — Acknowledges version baseline on successful write.
 * 3. `@MapPersistenceErrors(...)` — Translates low-level DB driver errors to domain exceptions.
 *
 * > [!IMPORTANT]
 * > This decorator assumes an autocommitted persistence operation where promise resolution means
 * > durable storage commit. Externally managed transactions require transaction commit-hook contracts,
 * > not method decorators.
 *
 * @param options Configuration object with an `entity` extractor function over the method's argument tuple.
 *
 * @example Usage in an update command repository
 * ```typescript
 * @Injectable()
 * export class UpdateRoleCommandRepository extends CommandRepository<Role, RoleSnapshot> {
 *   @Cache<Role, RoleSnapshot>((role) => `roles:${role.id}`)
 *   @AcknowledgePersisted<[Role]>({ entity: ([role]) => role })
 *   @MapPersistenceErrors<[Role], Role>({
 *     entity: ([role]) => role,
 *     unique: [{ constraint: 'roles_name_unique', columns: 'roles.name', error: (r) => new UniqueRoleNameException(r) }],
 *   })
 *   async save(role: Role): Promise<RoleSnapshot> {
 *     const snapshot = role.toJSON();
 *     await optimisticUpdate(this.store.em, Role, role, { name: snapshot.name }, 'Role');
 *     return snapshot;
 *   }
 * }
 * ```
 *
 * @example Usage in a create command repository
 * ```typescript
 * @Injectable()
 * export class CreateRoleCommandRepository extends CommandRepository<Role, RoleSnapshot> {
 *   @Cache<Role, RoleSnapshot>((role) => `roles:${role.id}`)
 *   @AcknowledgePersisted<[Role]>({ entity: ([role]) => role })
 *   @MapPersistenceErrors<[Role], Role>({
 *     entity: ([role]) => role,
 *     unique: [{ constraint: 'roles_name_unique', columns: 'roles.name', error: (r) => new UniqueRoleNameException(r) }],
 *   })
 *   async save(role: Role): Promise<RoleSnapshot> {
 *     const created = this.store.em.create(Role, role);
 *     this.store.em.persist(created);
 *     await this.store.em.flush();
 *     return created.toJSON();
 *   }
 * }
 * ```
 */
export function AcknowledgePersisted<TArgs extends unknown[]>(options: {
  entity: (args: TArgs) => PersistedAggregate;
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
      const entity = options.entity(args);
      const version = entity.version;
      const result = await original.apply(this, args);
      entity.acknowledgePersisted(version);
      return result;
    };
  };
}
