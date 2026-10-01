/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { getSessionPrincipal } from '@common/context/session-principal.store.js';
import type { SessionPrincipal } from '@common/types/session-principal.js';
import type { Capability } from '@nestjs-pipeline/casl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../users/domain/models/user.entity.js';
import { CaslPermissionSource } from './casl-permission.source.js';

vi.mock('@common/context/session-principal.store.js', () => ({
  getSessionPrincipal: vi.fn(),
}));

const session = vi.mocked(getSessionPrincipal);

const storedRules: Capability[] = [
  { subject: 'User', action: 'read' },
  { subject: 'Role', action: 'read', fields: ['id', 'name'] },
  { subject: 'User', action: 'delete', inverted: true },
];

function setup(user: User | null = null) {
  const findOne = vi.fn().mockResolvedValue(user);
  const find = vi.fn().mockResolvedValue(storedRules);
  const source = new CaslPermissionSource(
    { em: { findOne } } as never,
    { find } as never,
  );
  return { source, findOne, find };
}

describe('CaslPermissionSource', () => {
  beforeEach(() => session.mockReset());

  it('returns null without a session', async () => {
    session.mockReturnValue(undefined);

    await expect(setup().source.load()).resolves.toBeNull();
  });

  it('returns null for a blank principal id', async () => {
    session.mockReturnValue({
      id: '  ',
      type: 'user',
      tenant: 't',
    } as SessionPrincipal);

    await expect(setup().source.load()).resolves.toBeNull();
  });

  it('returns null for an unclassified principal without reading anything', async () => {
    session.mockReturnValue({ id: 'u-1', tenant: 't' } as SessionPrincipal);
    const { source, findOne, find } = setup();

    await expect(source.load()).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it('returns a service principal with its grants without reading the database', async () => {
    const grants = [{ subject: 'User', action: 'read' }];
    session.mockReturnValue({
      id: 'svc-1',
      type: 'service',
      tenant: 't',
      grants,
    });
    const { source, findOne, find } = setup();

    await expect(source.load()).resolves.toEqual({
      principal: { id: 'svc-1', principalType: 'service', department: null },
      rules: grants,
    });
    expect(findOne).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it('returns null for a service principal without grants', async () => {
    session.mockReturnValue({
      id: 'svc-1',
      type: 'service',
      tenant: 't',
    });

    await expect(setup().source.load()).resolves.toBeNull();
  });

  it('uses the rules a verified access token carried, in order, with no query', async () => {
    const grants: Capability[] = [
      { subject: 'User', action: 'read' },
      { subject: 'User', action: 'read', fields: ['email'], inverted: true },
    ];
    session.mockReturnValue({
      id: 'u-1',
      type: 'user',
      tenant: 't',
      department: 'sales',
      grants,
    });
    const { source, findOne, find } = setup();

    await expect(source.load()).resolves.toEqual({
      principal: { id: 'u-1', principalType: 'user', department: 'sales' },
      rules: grants,
    });
    expect(findOne).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it('returns null for a user missing from the database', async () => {
    session.mockReturnValue({ id: 'u-1', type: 'user', tenant: 't' });

    await expect(setup(null).source.load()).resolves.toBeNull();
  });

  it('reads the user and the ordered rules and returns the persisted principal attributes', async () => {
    const user = User.create('alice', 'alice@example.test', 'engineering');
    session.mockReturnValue({
      id: user.id,
      type: 'user',
      tenant: 't',
      department: 'stale-session-value',
    });
    const { source, findOne, find } = setup(user);

    await expect(source.load()).resolves.toEqual({
      principal: {
        id: user.id,
        principalType: 'user',
        department: 'engineering',
      },
      rules: storedRules,
    });
    expect(findOne).toHaveBeenCalledWith(User, { id: user.id });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, refresh: true }),
    );
  });

  it('issues the user and rule reads without waiting for each other', async () => {
    const user = User.create('alice', 'alice@example.test');
    session.mockReturnValue({
      id: user.id,
      type: 'user',
      tenant: 't',
    });
    let releaseUser: (value: User) => void = () => {};
    const findOne = vi.fn(
      () =>
        new Promise<User>((resolve) => {
          releaseUser = resolve;
        }),
    );
    const find = vi.fn().mockResolvedValue([]);
    const loading = new CaslPermissionSource(
      { em: { findOne } } as never,
      { find } as never,
    ).load();

    await Promise.resolve();
    expect(find).toHaveBeenCalledOnce();
    releaseUser(user);
    await expect(loading).resolves.toMatchObject({ rules: [] });
  });
});
