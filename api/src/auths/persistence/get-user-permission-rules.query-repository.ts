/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { capabilityFromRow } from '@auths/persistence/helpers/capability-row.mapper';
import { getSessionPrincipal } from '@common/context/session-principal.store';
import type { ICache } from '@cqrs-ddd/core/application';
import {
  CACHE_TOKEN,
  cacheKey,
  FromCache,
  QueryRepository,
} from '@cqrs-ddd/core/persistence';
import { Inject, Injectable } from '@nestjs/common';
import type { Capability } from '@nestjs-pipeline/casl';
import { cacheReadLogger } from '@persistence/cache/cache-loggers';
import { UserPermissionRule } from '@persistence/entities/user-permission-rule.entity';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { GetUserPermissionRulesQuery } from '../application/cqrs/queries/get-user-permission-rules.query';

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
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<Capability[]>,
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
