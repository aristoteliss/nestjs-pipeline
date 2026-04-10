import type { Client } from '@libsql/client';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CaslUserContext,
  IUserCapabilityProvider,
  UserCapabilities,
} from '@nestjs-pipeline/casl';
import { Cache, ICache, QueryRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { TURSO_CLIENT } from '@persistence/turso-store';
import { GetUserCapabilitiesQuery } from '../cqrs/queries/get-user-capabilities.query';

@Injectable()
export class GetUserCapabilitiesQueryRepository
  extends QueryRepository<GetUserCapabilitiesQuery, UserCapabilities>
  implements IUserCapabilityProvider
{
  constructor(
    @Inject(CACHE_TOKEN)
    protected readonly cache: ICache<UserCapabilities>,
    @Inject(TURSO_CLIENT) private readonly client: Client,
  ) {
    super(cache);
  }

  async getUserCapabilities(user: CaslUserContext): Promise<UserCapabilities> {
    return this.find(new GetUserCapabilitiesQuery({ userId: user.id }));
  }

  @Cache<GetUserCapabilitiesQuery, UserCapabilities>(
    (q) => `user:capabilities:${q.userId}`,
  )
  async find(query: GetUserCapabilitiesQuery): Promise<UserCapabilities> {
    const { userId } = query;

    // 1. Fetch role names
    const rolesResult = await this.client.execute({
      sql: `SELECT r.name FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = ?`,
      args: [userId],
    });

    // 2. Fetch per-user additional capabilities
    const additionalResult = await this.client.execute({
      sql: `SELECT c.subject, c.action, c.conditions, c.inverted, c.reason, c.fields
            FROM user_additional_capabilities uac
            JOIN capabilities c ON c.id = uac.capability_id
            WHERE uac.user_id = ?`,
      args: [userId],
    });

    // 3. Fetch per-user denied capabilities
    const deniedResult = await this.client.execute({
      sql: `SELECT c.subject, c.action, c.conditions, c.inverted, c.reason, c.fields
            FROM user_denied_capabilities udc
            JOIN capabilities c ON c.id = udc.capability_id
            WHERE udc.user_id = ?`,
      args: [userId],
    });

    const toCapability = (row: Record<string, unknown>) => ({
      subject: row.subject as string,
      action: row.action as string,
      conditions: row.conditions
        ? JSON.parse(row.conditions as string)
        : undefined,
      inverted: row.inverted === 1,
      reason: (row.reason as string) || undefined,
      fields: row.fields ? (row.fields as string).split(',') : undefined,
    });

    return {
      roles: rolesResult.rows.map((r) => r.name as string),
      additionalCapabilities: additionalResult.rows.map(toCapability),
      deniedCapabilities: deniedResult.rows.map(toCapability),
    };
  }
}
