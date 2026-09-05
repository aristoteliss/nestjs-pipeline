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

import { RootDomainOutcome } from '../domain/outcomes/root-domain.outcome';
import { ICache } from './cache.interface';
import { ICommandRepository } from './command-repository.interface';

/**
 * Base class for write-side (command) repositories.
 *
 * Persists a domain outcome via the abstract {@link save} method and receives an
 * {@link ICache} instance. Subclasses annotate `save()` with the `@Cache` decorator
 * to perform automatic write-through caching or cache eviction upon mutation.
 *
 * @typeParam TDomainOutcome - The outcome type accepted by {@link save}.
 * @typeParam TResult - The persisted result type returned by {@link save}.
 *
 * @example Creating a command repository with @Cache
 * ```typescript
 * @Injectable()
 * export class CreateUserCommandRepository extends CommandRepository<UserCreateOutcome, UserSnapshot> {
 *   constructor(
 *     @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
 *     @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
 *   ) {
 *     super(cache);
 *   }
 *
 *   @Cache<UserCreateOutcome, UserSnapshot>(
 *     (outcome) => filterCacheKey('user', { id: outcome.entity.id }),
 *   )
 *   async save(outcome: UserCreateOutcome): Promise<UserSnapshot> {
 *     const user = await this.store.em.upsert(User, outcome.entity);
 *     return user.toJSON();
 *   }
 * }
 * ```
 */
export abstract class CommandRepository<
  TDomainOutcome = RootDomainOutcome,
  TResult = unknown | null,
> implements ICommandRepository<TDomainOutcome, TResult>
{
  constructor(protected readonly cache: ICache<TResult>) {}

  abstract save(domainOutcome: TDomainOutcome): Promise<TResult | null>;
}
