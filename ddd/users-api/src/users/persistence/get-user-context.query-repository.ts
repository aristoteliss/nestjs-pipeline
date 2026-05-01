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

import { Inject, Injectable, Optional, Scope } from '@nestjs/common';
import type {
  CaslBehaviorOptions,
  CaslUserContext,
  IUserContextResolver,
} from '@nestjs-pipeline/casl';
import { CASL_SUBJECT_CONTEXT_PATHS } from '@nestjs-pipeline/casl';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { Cache, ICache, QueryRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { GetUserContextQuery } from '../cqrs/queries/get-user-context.query';
import { User } from '../domain/models/user.entity';

/**
 * Resolves the CASL user context from the HTTP request.
 *
 * Reads the current user from the configured CASL `subjectContextPaths`
 * (for example `sessionUser` in this sample app).
 *
 * This keeps user-context resolution aligned with the same request path
 * configuration used by `CaslBehavior` for instance-level subject checks.
 *
 * REQUEST-scoped so it can access the current HTTP request.
 */
@Injectable({ scope: Scope.REQUEST })
export class GetUserContextQueryRepository
  extends QueryRepository<GetUserContextQuery, CaslUserContext | null>
  implements IUserContextResolver {
  constructor(
    @Inject(CACHE_TOKEN)
    protected readonly cache: ICache<CaslUserContext | null>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
    @Optional()
    @Inject(CASL_SUBJECT_CONTEXT_PATHS)
    private readonly subjectContextPaths?: CaslBehaviorOptions['subjectContextPaths'],
  ) {
    super(cache);
  }

  async resolve(context: IPipelineContext): Promise<CaslUserContext | null> {
    const userContext = this.resolveUserContextFromRequest(
      context.request as Record<string, unknown> | undefined,
    );
    if (!userContext) return null;

    if (userContext.capabilities) {
      return {
        id: userContext.id,
        tenantId: userContext.tenantId,
        department: userContext.department,
        capabilities: userContext.capabilities,
      } as CaslUserContext;
    }

    if (!userContext.id) return null;

    return this.find(
      new GetUserContextQuery({ userId: String(userContext.id) }),
    ) as Promise<CaslUserContext | null>;
  }

  private resolveUserContextFromRequest(
    request: Record<string, unknown> | undefined,
  ): CaslUserContext | null {
    if (!request || !this.subjectContextPaths) return null;

    for (const path of this.subjectContextPaths) {
      const resolved = this.getNestedObject(request, path);
      if (resolved) {
        return resolved as CaslUserContext;
      }
    }

    return null;
  }

  private getNestedObject(
    source: Record<string, unknown>,
    path: string,
  ): Record<string, unknown> | undefined {
    const keys = path.split('.').filter(Boolean);
    if (keys.length === 0) return undefined;

    let current: unknown = source;
    for (const key of keys) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return current as Record<string, unknown>;
  }

  @Cache<GetUserContextQuery, CaslUserContext | undefined>(
    (q) => `user:context:${q.userId}`,
  )
  async find(query: GetUserContextQuery): Promise<CaslUserContext | null> {
    const { userId } = query;

    const userOrm = await this.store.em.findOne(User, { id: userId });

    if (!userOrm) return null;

    return {
      id: userOrm.id,
      tenantId: userOrm.tenantId as string,
      department: userOrm.department as string | null,
    };
  }
}
