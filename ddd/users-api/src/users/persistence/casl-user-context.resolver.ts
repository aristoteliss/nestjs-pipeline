/* Copyright (C) 2026-present Aristotelis — see repository license. */
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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Request-scoped CASL adapter that resolves the authenticated principal and
 * refreshes persisted user attributes used by authorization.
 *
 * Persistence-query responsibilities live in `GetUserContextQueryRepository`;
 * this adapter exists only for the CASL request/session resolution contract.
 * The UUID classification is intentionally preserved here and is addressed by
 * architecture issue #9 independently.
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

    const id = String(rawUser.id);
    const user = await this.store.em.findOne(User, { id });
    if (user) {
      return {
        id: user.id,
        department: (user.department as string | null) ?? null,
        ...(rawUser.capabilities ? { capabilities: rawUser.capabilities } : {}),
      } as CaslUserContext;
    }

    if (UUID_REGEX.test(id)) return null;

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
