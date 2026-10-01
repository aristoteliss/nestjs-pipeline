/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type IQueryRepository,
  type IWriteSideAggregateRepository,
  requireTenant,
} from '@cqrs-ddd/core/application';
import { Inject, Injectable } from '@nestjs/common';
import type { Capability } from '@nestjs-pipeline/casl';
import {
  type IJobPrincipal,
  InvalidJobContextError,
  type PrincipalReference,
} from '@nestjs-pipeline/job-context';
import {
  getSessionPrincipal,
  sessionPrincipalStore,
} from '../../common/context/session-principal.store.js';
import { API_CLIENTS } from '../../common/environment/api-clients.config.js';
import {
  isPrincipalType,
  isSessionPrincipalValid,
  type SessionPrincipal,
} from '../../common/types/session-principal.js';
import { GetUserQuery } from '../../users/application/cqrs/queries/get-user.query.js';
import type { User } from '../../users/domain/models/user.entity.js';
import { EXT_USER_QUERY_REPOSITORY } from '../../users/persistence/repository.tokens.js';
import type { Auth } from '../domain/models/auth.entity.js';
import { COMMAND_REPOSITORY } from '../persistence/repository.tokens.js';

/**
 * The api's `IJobPrincipal`: a job acts for the principal of the request that
 * enqueued it, bound through `sessionPrincipalStore` the way
 * `SessionPrincipalContextInterceptor` binds a request's.
 *
 * Nothing the payload says is trusted beyond identity. A user is bound only
 * while its `Auth` session exists, belongs to it, is not revoked and has not
 * expired, and its user row exists; it is bound without grants, so
 * `CaslPermissionSource` reads its current rules. An API client is bound only
 * while `API_CLIENTS` still lists it for the job's tenant, with the grants
 * listed there now. `@AsSystem` grants are bound as declared.
 */
@Injectable()
export class SessionJobPrincipal implements IJobPrincipal<Capability> {
  constructor(
    @Inject(COMMAND_REPOSITORY.updateAuth)
    private readonly sessions: IWriteSideAggregateRepository<Auth>,
    @Inject(EXT_USER_QUERY_REPOSITORY.getUser)
    private readonly users: IQueryRepository<GetUserQuery, User | null>,
  ) {}

  capture(): PrincipalReference | undefined {
    const principal = getSessionPrincipal();
    if (!principal || !isSessionPrincipalValid(principal)) return undefined;
    return { id: principal.id, type: principal.type, sessionId: principal.sid };
  }

  async restore<T>(
    reference: PrincipalReference,
    work: () => Promise<T>,
    grants?: readonly Capability[],
  ): Promise<T> {
    const principal = await this.resolve(reference, grants);
    return sessionPrincipalStore.run(principal, work);
  }

  private async resolve(
    { id, type, sessionId }: PrincipalReference,
    grants: readonly Capability[] | undefined,
  ): Promise<SessionPrincipal> {
    if (!isPrincipalType(type)) {
      throw new InvalidJobContextError(`principal type "${type}" is unknown`);
    }
    const tenant = requireTenant('restoring a job principal');
    if (grants) return { id, type, tenant, grants: [...grants] };

    if (type === 'service') {
      const client = API_CLIENTS.get(id);
      if (!client?.tenants.has(tenant)) {
        throw new InvalidJobContextError(
          'the API client is no longer allowed in this tenant',
        );
      }
      return { id, type, tenant, grants: client.grants };
    }

    const session = sessionId ? await this.sessions.findById(sessionId) : null;
    if (
      !session ||
      session.userId !== id ||
      session.revokedAt !== null ||
      Date.now() >= session.expiresAt
    ) {
      throw new InvalidJobContextError(
        'the user session is unknown, revoked or expired',
      );
    }
    const user = await this.users.find(
      new GetUserQuery({ userId: id }, { refresh: true }),
    );
    if (!user) {
      throw new InvalidJobContextError('the user no longer exists');
    }
    return { id, type, tenant, sid: sessionId };
  }
}
