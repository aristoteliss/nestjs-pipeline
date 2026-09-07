/*
 * Copyright (C) 2026-present Aristotelis
 * See repository license for full terms.
 */

import { getSessionUserFromStore } from '@common/context/session-user.store';
import type { PrincipalType } from '@common/types/SessionUser';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  type CaslBehaviorOptions,
  type CaslUserContext,
  CASL_SUBJECT_CONTEXT_PATHS,
  type IUserContextResolver,
} from '@nestjs-pipeline/casl';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { GetUserContextQuery } from '../cqrs/queries/get-user-context.query';

type TypedCaslPrincipal = CaslUserContext & {
  principalType?: PrincipalType;
};

/**
 * Application service that resolves CASL principals using an explicit identity
 * discriminator supplied by the authentication boundary.
 *
 * `user` principals must still exist in persistence; `service` principals are
 * accepted only when they carry explicit capabilities. ID syntax is irrelevant:
 * a UUID-looking service id remains a service and a non-UUID user id remains a
 * database user.
 */
@Injectable()
export class CaslUserContextResolver implements IUserContextResolver {
  constructor(
    @Inject(QueryBus)
    private readonly queryBus: QueryBus,
    @Optional()
    @Inject(CASL_SUBJECT_CONTEXT_PATHS)
    private readonly subjectContextPaths?: CaslBehaviorOptions['subjectContextPaths'],
  ) {}

  async resolve(context: IPipelineContext): Promise<CaslUserContext | null> {
    const rawUser = (
      this.resolveUserContextFromRequest(
        context.request as Record<string, unknown> | undefined,
      ) ??
      (getSessionUserFromStore() as unknown as CaslUserContext | undefined)
    ) as TypedCaslPrincipal | undefined;

    if (!rawUser?.id || !rawUser.principalType) return null;

    const id = String(rawUser.id);

    if (rawUser.principalType === 'user') {
      const persisted = await this.queryBus.execute<
        GetUserContextQuery,
        CaslUserContext | null
      >(new GetUserContextQuery({ userId: id }));

      if (!persisted) return null;

      return {
        ...persisted,
        ...(rawUser.capabilities ? { capabilities: rawUser.capabilities } : {}),
      } as CaslUserContext;
    }

    if (rawUser.principalType === 'service' && rawUser.capabilities) {
      return {
        id,
        department: (rawUser.department as string | null) ?? null,
        capabilities: rawUser.capabilities,
      } as CaslUserContext;
    }

    return null;
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

    return current && typeof current === 'object'
      ? (current as Record<string, unknown>)
      : undefined;
  }
}
