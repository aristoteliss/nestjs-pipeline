/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bootstrapE2E,
  E2E_LOGIN_CODE,
  type E2EContext,
  rebuildPermissions,
} from './support/e2e-app';

const ADMIN_ROLE = '019de10c-b680-7000-8000-000000000001';

/** The `refresh_token` Set-Cookie header of a response, if any. */
function refreshCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return cookies.find((cookie) => cookie.startsWith('refresh_token='));
}

/** `refresh_token=<value>` as a request Cookie header. */
function cookiePair(setCookie: string | undefined): string {
  if (!setCookie) throw new Error('response set no refresh cookie');
  return setCookie.split(';')[0];
}

/**
 * The access/refresh contract over HTTP: login returns a short-lived access
 * token and sets the refresh token as an HttpOnly cookie; refresh rotates it;
 * logout revokes the session.
 */
describe.each(['express', 'fastify'] as const)('auths (e2e, %s)', (adapter) => {
  let ctx: E2EContext;
  let http: Server;

  const admin = JSON.stringify({ id: 'admin-1', grants: ['all|manage|*'] });

  let emailSeq = 0;
  const newEmail = () =>
    `auth-${adapter}-${Date.now()}-${emailSeq++}@acme.test`;

  /** A user who can log in and may list users. */
  async function seedUser(email: string): Promise<string> {
    const created = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name: 'Login Lena', department: 'engineering' });
    expect(created.status).toBe(201);
    const { MIKRO_ORM_CLIENT } = await import(
      '../src/persistence/mikro-orm.store'
    );
    await ctx.app
      .get(MIKRO_ORM_CLIENT)
      .em.execute('insert into user_roles (user_id, role_id) values (?, ?)', [
        created.body.id,
        ADMIN_ROLE,
      ]);
    await rebuildPermissions(ctx.app, [created.body.id]);
    return created.body.id;
  }

  const login = (body: Record<string, unknown>) =>
    request(http)
      .post('/auths/login')
      .set('x-tenant-schema', 'tenant')
      .send(body);

  // Each test refreshes from its own forwarded client address: the refresh
  // rate limit is keyed on tenant + client IP.
  const network = adapter === 'express' ? '198.51.100' : '198.51.101';
  let clientIp = `${network}.1`;
  let ipSeq = 1;
  beforeEach(() => {
    ipSeq += 1;
    clientIp = `${network}.${ipSeq}`;
  });

  const refresh = (cookie?: string, fromIp = clientIp) => {
    const req = request(http)
      .post('/auths/refresh')
      .set('x-tenant-schema', 'tenant')
      .set('x-forwarded-for', fromIp);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  const logout = (cookie?: string) => {
    const req = request(http)
      .post('/auths/logout')
      .set('x-tenant-schema', 'tenant');
    return cookie ? req.set('Cookie', cookie) : req;
  };

  const listUsers = (accessToken: string) =>
    request(http)
      .get('/users')
      .set('x-tenant-schema', 'tenant')
      .set('authorization', `Bearer ${accessToken}`);

  beforeAll(async () => {
    ctx = await bootstrapE2E({ adapter, trustProxy: 'true' });
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('POST /auths/login', () => {
    it('returns an access token and sets the refresh token only as a strict HttpOnly cookie', async () => {
      const email = newEmail();
      const userId = await seedUser(email);

      const res = await login({ email, code: E2E_LOGIN_CODE });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: userId,
        principalType: 'user',
        tenant: 'tenant',
        email,
        accessToken: expect.any(String),
        accessTokenExpiresAt: expect.any(Number),
      });
      expect(res.body).not.toHaveProperty('refreshToken');
      expect(res.body).not.toHaveProperty('token');
      const cookie = refreshCookie(res) as string;
      const value = cookiePair(cookie).slice('refresh_token='.length);
      expect(JSON.stringify(res.body)).not.toContain(value);
      expect(cookie).toMatch(/;\s*HttpOnly/i);
      expect(cookie).toMatch(/;\s*Secure/i);
      expect(cookie).toMatch(/;\s*SameSite=Strict/i);
      expect(cookie).toMatch(/;\s*Path=\/auths(;|$)/);
    });

    it('rejects an unknown email (401)', async () => {
      const res = await login({ email: newEmail(), code: E2E_LOGIN_CODE });

      expect(res.status).toBe(401);
      expect(refreshCookie(res)).toBeUndefined();
    });

    it('rejects an invalid code (401)', async () => {
      const email = newEmail();
      await seedUser(email);

      const res = await login({ email, code: '000000' });

      expect(res.status).toBe(401);
    });

    it('rejects a malformed payload at the Zod boundary (400)', async () => {
      const res = await login({ email: 'not-an-email', code: '' });

      expect(res.status).toBe(400);
      expect(res.body.fieldErrors).toMatchObject({
        email: expect.any(Array),
        code: expect.any(Array),
      });
    });

    it('requires a tenant context (403)', async () => {
      const res = await request(http)
        .post('/auths/login')
        .send({ email: newEmail(), code: E2E_LOGIN_CODE });

      expect(res.status).toBe(403);
    });
  });

  describe('session lifecycle', () => {
    it('logs in, calls the API, refreshes, calls again, logs out, and can no longer refresh', async () => {
      const email = newEmail();
      await seedUser(email);

      const loggedIn = await login({ email, code: E2E_LOGIN_CODE });
      expect((await listUsers(loggedIn.body.accessToken)).status).toBe(200);

      const refreshed = await refresh(cookiePair(refreshCookie(loggedIn)));
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.accessToken).toEqual(expect.any(String));
      const rotated = cookiePair(refreshCookie(refreshed));
      expect(rotated).not.toBe(cookiePair(refreshCookie(loggedIn)));
      expect((await listUsers(refreshed.body.accessToken)).status).toBe(200);

      const out = await logout(rotated);
      expect(out.status).toBe(204);
      expect(refreshCookie(out)).toMatch(/^refresh_token=;/);

      const afterLogout = await refresh(rotated);
      expect(afterLogout.status).toBe(401);
      expect(afterLogout.body.code).toBe('refresh_invalid');

      // An issued access token stays valid until it expires.
      expect((await listUsers(refreshed.body.accessToken)).status).toBe(200);
    });

    it('answers a second refresh with the same cookie without rotating again', async () => {
      const email = newEmail();
      await seedUser(email);
      const original = cookiePair(
        refreshCookie(await login({ email, code: E2E_LOGIN_CODE })),
      );

      const winner = await refresh(original);
      const loser = await refresh(original);

      expect(winner.status).toBe(200);
      expect(loser.status).toBe(200);
      expect(refreshCookie(winner)).toBeDefined();
      expect(refreshCookie(loser)).toBeUndefined();
      expect(loser.body.accessToken).toEqual(expect.any(String));

      const next = await refresh(cookiePair(refreshCookie(winner)));
      expect(next.status).toBe(200);
      expect(refreshCookie(next)).toBeDefined();
    });

    it('rejects a missing or unknown refresh cookie (401)', async () => {
      const missing = await refresh();
      const unknown = await refresh('refresh_token=never-issued');

      expect(missing.status).toBe(401);
      expect(missing.body.code).toBe('refresh_invalid');
      expect(unknown.status).toBe(401);
      expect(unknown.body.code).toBe('refresh_invalid');
    });

    it('answers logout with 204 for a missing or unknown cookie', async () => {
      expect((await logout()).status).toBe(204);
      expect((await logout('refresh_token=never-issued')).status).toBe(204);
    });

    it('rate-limits refreshes per forwarded client IP when TRUST_PROXY is set', async () => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        expect((await refresh('refresh_token=never-issued')).status).toBe(401);
      }

      expect((await refresh('refresh_token=never-issued')).status).toBe(429);
      expect(
        (await refresh('refresh_token=never-issued', `${network}.250`)).status,
      ).toBe(401);
    });
  });
});
