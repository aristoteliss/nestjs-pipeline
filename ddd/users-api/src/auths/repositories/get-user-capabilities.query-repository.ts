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

import { SqlEntityManager } from '@mikro-orm/libsql';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CaslUserContext,
  IUserCapabilityProvider,
  UserCapabilities,
} from '@nestjs-pipeline/casl';
import { Cache, ICache, QueryRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { GetUserCapabilitiesQuery } from '../cqrs/queries/get-user-capabilities.query';

interface RoleRow {
  name: string;
}

interface CapabilityRow {
  subject: string;
  action: string;
  conditions: string | null;
  inverted: number;
  reason: string | null;
  fields: string | null;
}

@Injectable()
export class GetUserCapabilitiesQueryRepository
  extends QueryRepository<GetUserCapabilitiesQuery, UserCapabilities>
  implements IUserCapabilityProvider {
  constructor(
    @Inject(CACHE_TOKEN)
    protected readonly cache: ICache<UserCapabilities>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
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
    const em = this.store.em as unknown as SqlEntityManager;

    const rolesResult = await em.execute<RoleRow[]>(
      `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`,
      [userId],
    );

    const additionalResult = await em.execute<CapabilityRow[]>(
      `SELECT c.subject, c.action, c.conditions, c.inverted, c.reason, c.fields
       FROM user_additional_capabilities uac
       JOIN capabilities c ON c.id = uac.capability_id
       WHERE uac.user_id = ?`,
      [userId],
    );

    const deniedResult = await em.execute<CapabilityRow[]>(
      `SELECT c.subject, c.action, c.conditions, c.inverted, c.reason, c.fields
       FROM user_denied_capabilities udc
       JOIN capabilities c ON c.id = udc.capability_id
       WHERE udc.user_id = ?`,
      [userId],
    );

    const toCapability = (row: CapabilityRow) => ({
      subject: row.subject,
      action: row.action,
      conditions: row.conditions ? JSON.parse(row.conditions) : undefined,
      inverted: row.inverted === 1,
      reason: row.reason ?? undefined,
      fields: row.fields ? row.fields.split(',') : undefined,
    });

    return {
      roles: rolesResult.map((r) => r.name),
      additionalCapabilities: additionalResult.map(toCapability),
      deniedCapabilities: deniedResult.map(toCapability),
    };
  }
}
