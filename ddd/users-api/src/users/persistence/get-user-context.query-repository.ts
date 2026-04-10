import { AuthCommand } from '@common/cqrs/commands/auth.command';
import type { Client } from '@libsql/client';
import { Inject, Injectable, Scope } from '@nestjs/common';
import type {
  CaslUserContext,
  IUserContextResolver,
} from '@nestjs-pipeline/casl';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { Cache, ICache, QueryRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { TURSO_CLIENT } from '@persistence/turso-store';
import { GetUserContextQuery } from '../cqrs/queries/get-user-context.query';

/**
 * Resolves the CASL user context from the HTTP request.
 *
 * Reads the `x-user-id` header (for easy manual testing / demo purposes).
 * In production you would extract the user from a JWT or session instead.
 *
 * REQUEST-scoped so it can access the current HTTP request.
 */
@Injectable({ scope: Scope.REQUEST })
export class GetUserContextQueryRepository
  extends QueryRepository<GetUserContextQuery, CaslUserContext | null>
  implements IUserContextResolver
{
  constructor(
    @Inject(CACHE_TOKEN)
    protected readonly cache: ICache<CaslUserContext | null>,
    @Inject(TURSO_CLIENT) private readonly client: Client,
  ) {
    super(cache);
  }

  async resolve(context: IPipelineContext): Promise<CaslUserContext | null> {
    const user = (context.request as AuthCommand)?.sessionUser;
    if (!user) return null;

    if (user.capabilities) {
      return {
        id: user.id,
        tenantId: user.tenantId,
        department: user.department,
        capabilities: user.capabilities,
      } as CaslUserContext;
    }

    if (!user.id) return null;

    return this.find(
      new GetUserContextQuery({ userId: user.id }),
    ) as Promise<CaslUserContext | null>;
  }

  @Cache<GetUserContextQuery, CaslUserContext | undefined>(
    (q) => `user:context:${q.userId}`,
  )
  async find(query: GetUserContextQuery): Promise<CaslUserContext | null> {
    const { userId } = query;

    const result = await this.client.execute({
      sql: `SELECT id, tenant_id, department FROM users WHERE id = ?`,
      args: [userId],
    });

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id as string,
      tenantId: row.tenant_id as string | undefined,
      department: row.department as string | undefined,
    };
  }
}
