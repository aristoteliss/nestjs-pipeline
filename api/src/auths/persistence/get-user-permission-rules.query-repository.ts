/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { capabilityFromRow } from '@auths/persistence/helpers/capability-row.mapper.js';
import { getSessionPrincipal } from '@common/context/session-principal.store.js';
import type { ICache } from '@cqrs-ddd/core/application';
import {
  cacheKey,
  FromCache,
  QueryRepository,
} from '@cqrs-ddd/core/persistence';
import type { Capability } from '@cqrs-ddd/pipeline-casl';
import { Inject, Injectable } from '@nestjs/common';
import { CACHE } from '@persistence/cache/cache.token.js';
import { cacheReadLogger } from '@persistence/cache/cache-loggers.js';
import { UserPermissionRule } from '@persistence/entities/user-permission-rule.entity.js';
import {
  MIKRO_ORM_CLIENT,
  MikroOrmStore,
} from '@persistence/mikro-orm.store.js';
import { GetUserPermissionRulesQuery } from '../application/cqrs/queries/get-user-permission-rules.query.js';

function buildConditions(
  query: GetUserPermissionRulesQuery,
): Record<string, unknown> {
  return { userId: String(query.userId) };
}

/**
 * Query repository resolving a user's materialized permission rules
 * ordered by direct rules first, then inverted rules, each group by position.
 */
@Injectable()
export class GetUserPermissionRulesRepository extends QueryRepository<
  GetUserPermissionRulesQuery,
  Capability[]
> {
  constructor(
    @Inject(CACHE) protected readonly cache: ICache<Capability[]>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  /**
   * Resolves the materialized permission rules for the user specified in the query.
   *
   * @param query - The query carrying the target `userId`.
   * @returns Array of capabilities ordered by direct rules first, then inverted.
   *
   * @example
   * ```ts
   * const rules = await this.repo.find(new GetUserPermissionRulesQuery({ userId: 'alice' }));
   * ```
   */
  @FromCache<GetUserPermissionRulesQuery, Capability[]>({
    logger: cacheReadLogger,
    keyFn: (q) =>
      cacheKey(
        'user_permission_rules',
        buildConditions(q),
        getSessionPrincipal()?.tenant,
      ),
  })
  async find(query: GetUserPermissionRulesQuery): Promise<Capability[]> {
    const rows = await this.store.em.find(
      UserPermissionRule,
      { userId: String(query.userId) },
      { orderBy: [{ inverted: 'asc' }, { position: 'asc' }] },
    );
    return rows.map(capabilityFromRow);
  }
}
