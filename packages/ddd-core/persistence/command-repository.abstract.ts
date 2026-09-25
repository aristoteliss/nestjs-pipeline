/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache } from './cache.interface';
import { ICommandRepository } from './command-repository.interface';

/**
 * Base class for write-side (command) repositories.
 *
 * Persists an entity or aggregate state via the abstract {@link save} method and receives an
 * {@link ICache} instance. Subclasses annotate `save()` with the `@Cache` decorator
 * to perform automatic write-through caching or cache eviction upon mutation.
 *
 * @typeParam TEntity - The aggregate entity type accepted by {@link save}.
 * @typeParam TResult - The persisted result type returned by {@link save}.
 *
 * @example Creating a command repository with @Cache
 * ```typescript
 * @Injectable()
 * export class CreateUserCommandRepository extends CommandRepository<User, UserSnapshot> {
 *   constructor(
 *     @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
 *     @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
 *   ) {
 *     super(cache);
 *   }
 *
 *   @Cache<User, UserSnapshot>(
 *     (user) => filterCacheKey(User.aggregateName, { id: user.id }),
 *   )
 *   async save(user: User): Promise<UserSnapshot> {
 *     const created = await this.store.em.upsert(User, user);
 *     return created.toJSON();
 *   }
 * }
 * ```
 */
export abstract class CommandRepository<
  TEntity = unknown,
  TResult = unknown | null,
  TCache = unknown,
> implements ICommandRepository<TEntity, TResult>
{
  constructor(protected readonly cache: ICache<TCache>) {}

  abstract save(entity: TEntity): Promise<TResult | null>;
}
