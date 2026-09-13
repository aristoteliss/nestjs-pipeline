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

import { getSessionUserFromStore } from '@common/context/session-user.store';
import { Inject, Injectable, Optional, Scope } from '@nestjs/common';
import type {
  CaslBehaviorOptions,
  CaslUserContext,
  IUserContextResolver,
} from '@nestjs-pipeline/casl';
import { CASL_SUBJECT_CONTEXT_PATHS } from '@nestjs-pipeline/casl';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { User } from '../domain/models/user.entity';

/**
 * Request-scoped CASL adapter that resolves the authenticated principal and
 * refreshes persisted user attributes used by authorization.
 *
 * Principal classification is explicit. User principals are always checked
 * against persistence regardless of identifier syntax. Service principals are
 * never looked up as users and may rely on capabilities issued by their
 * authenticator. Missing principal classification fails closed.
 */
@Injectable({ scope: Scope.REQUEST })
export class CaslUserContextResolver implements IUserContextResolver {
  constructor(
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
    @Optional()
    @Inject(CASL_SUBJECT_CONTEXT_PATHS)
    private readonly subjectContextPaths?: CaslBehaviorOptions['subjectContextPaths'],
  ) {}

  async resolve(context: IPipelineContext): Promise<CaslUserContext | null> {
    const rawUser =
      this.resolveUserContextFromRequest(
        context.request as Record<string, unknown> | undefined,
      ) ??
      (getSessionUserFromStore() as unknown as CaslUserContext | undefined);

    if (!rawUser?.id) return null;

    const principalType = (rawUser as { principalType?: unknown })
      .principalType;
    if (principalType === 'service') {
      if (!rawUser.capabilities) return null;
      return {
        id: String(rawUser.id),
        department: (rawUser.department as string | null) ?? null,
        capabilities: rawUser.capabilities,
      } as CaslUserContext;
    }

    if (principalType !== 'user') return null;

    const user = await this.store.em.findOne(User, { id: String(rawUser.id) });
    if (!user) return null;

    return {
      id: user.id,
      department: (user.department as string | null) ?? null,
      ...(rawUser.capabilities ? { capabilities: rawUser.capabilities } : {}),
    } as CaslUserContext;
  }

  private resolveUserContextFromRequest(
    request: Record<string, unknown> | undefined,
  ): CaslUserContext | null {
    if (!request || !this.subjectContextPaths) return null;

    for (const path of this.subjectContextPaths) {
      const resolved = this.getNestedObject(request, path);
      if (resolved) return resolved as CaslUserContext;
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
      if (!current || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[key];
    }

    return current && typeof current === 'object'
      ? (current as Record<string, unknown>)
      : undefined;
  }
}
