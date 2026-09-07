/*
 * Copyright (C) 2026-present Aristotelis
 * See repository license for full terms.
 */

import { getSessionUserFromStore } from '@common/context/session-user.store';
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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Application service that resolves the CASL principal from pipeline/session
 * context and delegates database-user lookup through CQRS.
 *
 * This class is intentionally singleton: all request state arrives through the
 * `IPipelineContext` argument or AsyncLocalStorage; no Nest request-scoped
 * injection is required. Persistence lookup stays behind `GetUserContextQuery`.
 *
 * The legacy UUID-vs-machine classification is retained here temporarily so
 * finding #8 remains an SRP/scoping refactor only; Architecture.md finding #9
 * replaces that heuristic with an explicit principal discriminator.
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
    const rawUser =
      this.resolveUserContextFromRequest(
        context.request as Record<string, unknown> | undefined,
      ) ??
      (getSessionUserFromStore() as unknown as CaslUserContext | undefined);

    if (!rawUser?.id) return null;

    const id = String(rawUser.id);
    const persisted = await this.queryBus.execute<
      GetUserContextQuery,
      CaslUserContext | null
    >(new GetUserContextQuery({ userId: id }));

    if (persisted) {
      return {
        ...persisted,
        ...(rawUser.capabilities ? { capabilities: rawUser.capabilities } : {}),
      } as CaslUserContext;
    }

    // Kept only for behavioral compatibility until finding #9 introduces an
    // explicit principal discriminator.
    if (UUID_REGEX.test(id)) {
      return null;
    }

    if (rawUser.capabilities) {
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
