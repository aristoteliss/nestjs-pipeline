/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  getSessionPrincipal,
  sessionPrincipalStore,
} from '@common/context/session-principal.store.js';
import type { SessionPrincipal } from '@common/types/session-principal.js';
import {
  type IQueryRepository,
  type IWriteSideAggregateRepository,
  setTenantResolver,
} from '@cqrs-ddd/core/application';
import { InvalidJobContextError } from '@nestjs-pipeline/job-context';
import { currentTenantId } from '@nestjs-pipeline/tenant';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetUserQuery } from '../../users/application/cqrs/queries/get-user.query.js';
import type { User } from '../../users/domain/models/user.entity.js';
import { Auth } from '../domain/models/auth.entity.js';
import { SessionJobPrincipal } from './session-job-principal.js';

const TENANT = 'tenant_a';

beforeEach(() => setTenantResolver(() => TENANT));
afterEach(() => setTenantResolver(currentTenantId));

vi.mock('../../common/environment/api-clients.config.js', () => ({
  API_CLIENTS: new Map([
    [
      'reporting',
      {
        tenants: new Set(['tenant_a']),
        grants: [{ action: 'read', subject: 'User' }],
      },
    ],
  ]),
}));

const USER_ID = '019488e0-0000-7000-8000-000000000001';
const HOUR = 3_600_000;

function session({
  userId = USER_ID,
  expiresAt = Date.now() + HOUR,
  isRevoked = false,
} = {}) {
  const auth = Auth.create(userId, 'hash', expiresAt);
  if (isRevoked) auth.revoke(Date.now() - 1);
  return auth;
}

function principal({
  auth = session() as Auth | null,
  user = { id: USER_ID } as User | null,
} = {}) {
  const sessions = {
    findById: vi.fn().mockResolvedValue(auth),
  } as unknown as IWriteSideAggregateRepository<Auth>;
  const users = {
    find: vi.fn().mockResolvedValue(user),
  } as unknown as IQueryRepository<GetUserQuery, User | null>;
  return {
    subject: new SessionJobPrincipal(sessions, users),
    sessions,
    users,
  };
}

const bound = () => Promise.resolve(getSessionPrincipal());

describe('SessionJobPrincipal', () => {
  describe('capture', () => {
    it('keeps the identity and session of the current principal', () => {
      const current: SessionPrincipal = {
        id: USER_ID,
        type: 'user',
        tenant: 'tenant_a',
        sid: 's-1',
        email: 'a@example.test',
        grants: [],
      };

      const captured = sessionPrincipalStore.run(current, () =>
        principal().subject.capture(),
      );

      expect(captured).toEqual({ id: USER_ID, type: 'user', sessionId: 's-1' });
    });

    it('captures nothing without a valid principal', () => {
      const { subject } = principal();

      expect(subject.capture()).toBeUndefined();
      expect(
        sessionPrincipalStore.run(
          { id: 'x', type: 'robot' } as unknown as SessionPrincipal,
          () => subject.capture(),
        ),
      ).toBeUndefined();
    });
  });

  describe('restore', () => {
    it('binds a user with an active session without grants, so current rules are read', async () => {
      const { subject, sessions, users } = principal();

      await expect(
        subject.restore({ id: USER_ID, type: 'user', sessionId: 's-1' }, bound),
      ).resolves.toEqual({
        id: USER_ID,
        type: 'user',
        tenant: 'tenant_a',
        sid: 's-1',
      });
      expect(sessions.findById).toHaveBeenCalledWith('s-1');
      expect(users.find).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID }),
      );
    });

    it.each([
      ['an unknown session', { auth: null }],
      ['another user’s session', { auth: session({ userId: 'someone-else' }) }],
      ['a revoked session', { auth: session({ isRevoked: true }) }],
      ['an expired session', { auth: session({ expiresAt: Date.now() - 1 }) }],
    ])('refuses a user with %s', async (_case, options) => {
      const work = vi.fn();

      await expect(
        principal(options).subject.restore(
          { id: USER_ID, type: 'user', sessionId: 's-1' },
          work,
        ),
      ).rejects.toThrow('the user session is unknown, revoked or expired');
      expect(work).not.toHaveBeenCalled();
    });

    it('refuses a user reference without a session id', async () => {
      const { subject, sessions } = principal();

      await expect(
        subject.restore({ id: USER_ID, type: 'user' }, bound),
      ).rejects.toBeInstanceOf(InvalidJobContextError);
      expect(sessions.findById).not.toHaveBeenCalled();
    });

    it('refuses a user that no longer exists', async () => {
      await expect(
        principal({ user: null }).subject.restore(
          { id: USER_ID, type: 'user', sessionId: 's-1' },
          bound,
        ),
      ).rejects.toThrow('the user no longer exists');
    });

    it('binds an API client with the grants its configuration lists now', async () => {
      await expect(
        principal().subject.restore(
          { id: 'reporting', type: 'service' },
          bound,
        ),
      ).resolves.toEqual({
        id: 'reporting',
        type: 'service',
        tenant: 'tenant_a',
        grants: [{ action: 'read', subject: 'User' }],
      });
    });

    it('refuses an API client that is not configured for the tenant', async () => {
      await expect(
        principal().subject.restore({ id: 'unknown', type: 'service' }, bound),
      ).rejects.toThrow('the API client is no longer allowed in this tenant');
    });

    it('binds the grants declared by system work as they are', async () => {
      const grants = [{ action: 'delete', subject: 'Auth' }] as const;
      const { subject, sessions } = principal();

      await expect(
        subject.restore({ id: 'cleanup', type: 'service' }, bound, [...grants]),
      ).resolves.toEqual({
        id: 'cleanup',
        type: 'service',
        tenant: 'tenant_a',
        grants: [...grants],
      });
      expect(sessions.findById).not.toHaveBeenCalled();
    });

    it('refuses an unknown principal type', async () => {
      await expect(
        principal().subject.restore({ id: 'x', type: 'robot' }, bound),
      ).rejects.toThrow('principal type "robot" is unknown');
    });
  });
});
