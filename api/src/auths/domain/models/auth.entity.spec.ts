/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from '../errors/refresh-token.errors';
import { AuthRefreshedEvent } from '../events/auth-refreshed.event';
import { AuthRevokedEvent } from '../events/auth-revoked.event';
import { CreatedAuthEvent } from '../events/create-auth.event';
import { Auth } from './auth.entity';

const USER = '019488e0-0000-7000-8000-000000000001';
const START = 1_000_000;
const EXPIRES = START + 60_000;
const GRACE = 30_000;

function session(): Auth {
  const auth = Auth.start(USER, 'hash-a', EXPIRES);
  auth.uncommit();
  return auth;
}

describe('Auth session', () => {
  it('starts with the current hash and fixed expiry, recording a creation event without token material', () => {
    const auth = Auth.start(USER, 'hash-a', EXPIRES);

    expect(auth).toMatchObject({
      userId: USER,
      refreshTokenHash: 'hash-a',
      previousRefreshTokenHash: null,
      rotatedAt: null,
      revokedAt: null,
      expiresAt: EXPIRES,
      version: 1,
    });
    const [event] = auth.getUncommittedEvents();
    expect(event).toBeInstanceOf(CreatedAuthEvent);
    expect(JSON.stringify(event)).not.toContain('hash-a');
  });

  it('rotates when the current token is presented', () => {
    const auth = session();

    expect(auth.refresh('hash-a', 'hash-b', START + 1, GRACE)).toBe('rotated');
    expect(auth).toMatchObject({
      refreshTokenHash: 'hash-b',
      previousRefreshTokenHash: 'hash-a',
      rotatedAt: START + 1,
      version: 2,
    });
    expect(auth.getUncommittedEvents()).toEqual([
      expect.any(AuthRefreshedEvent),
    ]);
    expect(JSON.stringify(auth.getUncommittedEvents())).not.toContain('hash');
  });

  it('answers grace for the previous token within the window without changing state', () => {
    const auth = session();
    auth.refresh('hash-a', 'hash-b', START, GRACE);
    auth.uncommit();

    expect(auth.refresh('hash-a', 'hash-c', START + GRACE, GRACE)).toBe(
      'grace',
    );
    expect(auth).toMatchObject({
      refreshTokenHash: 'hash-b',
      previousRefreshTokenHash: 'hash-a',
      version: 2,
      revokedAt: null,
    });
    expect(auth.getUncommittedEvents()).toEqual([]);
  });

  it('revokes and reports reuse for the previous token after the window', () => {
    const auth = session();
    auth.refresh('hash-a', 'hash-b', START, GRACE);
    auth.uncommit();

    expect(() =>
      auth.refresh('hash-a', 'hash-c', START + GRACE + 1, GRACE),
    ).toThrow(RefreshTokenReuseError);
    expect(auth.revokedAt).toBe(START + GRACE + 1);
    expect(auth.getUncommittedEvents()).toEqual([expect.any(AuthRevokedEvent)]);
  });

  it('treats a zero grace window as immediate reuse', () => {
    const auth = session();
    auth.refresh('hash-a', 'hash-b', START, 0);

    expect(auth.refresh('hash-a', 'hash-c', START, 0)).toBe('grace');
    expect(() => auth.refresh('hash-a', 'hash-c', START + 1, 0)).toThrow(
      RefreshTokenReuseError,
    );
  });

  it.each([
    [
      'an unknown hash',
      (auth: Auth) => auth.refresh('other', 'n', START, GRACE),
    ],
    [
      'an expired session',
      (auth: Auth) => auth.refresh('hash-a', 'n', EXPIRES, GRACE),
    ],
    [
      'a revoked session',
      (auth: Auth) => {
        auth.revoke(START);
        return auth.refresh('hash-a', 'n', START + 1, GRACE);
      },
    ],
  ])('rejects %s as invalid', (_, present) => {
    expect(() => present(session())).toThrow(InvalidRefreshTokenError);
  });

  it('keeps the first revocation time', () => {
    const auth = session();
    auth.revoke(START + 5);
    auth.uncommit();
    auth.revoke(START + 9);

    expect(auth.revokedAt).toBe(START + 5);
    expect(auth.getUncommittedEvents()).toEqual([]);
  });

  it('round-trips its snapshot', () => {
    const auth = session();
    auth.refresh('hash-a', 'hash-b', START, GRACE);

    expect(Auth.fromJSON(auth.toJSON()).toJSON()).toEqual(auth.toJSON());
  });
});
