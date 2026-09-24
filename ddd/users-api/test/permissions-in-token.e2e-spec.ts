/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Server } from 'node:http';
import { uuidv7 } from '@nestjs-pipeline/core';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  bootstrapE2E,
  E2E_LOGIN_CODE,
  type E2EContext,
  rebuildPermissions,
} from './support/e2e-app';

const ADMIN_ROLE = '019de10c-b680-7000-8000-000000000001';
const admin = JSON.stringify({ id: 'admin-1', grants: ['all|manage|*'] });

function setCookies(res: request.Response): string[] {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

function cookiePair(res: request.Response, name: string): string {
  const cookie = setCookies(res).find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`response set no ${name} cookie`);
  return cookie.split(';')[0];
}

async function sql(ctx: E2EContext, statement: string, params: unknown[]) {
  const { MIKRO_ORM_CLIENT } = await import(
    '../src/persistence/mikro-orm.store'
  );
  return ctx.app.get(MIKRO_ORM_CLIENT).em.execute(statement, params);
}

/** Seeds a user holding the admin role and returns its id and email. */
async function seedAdminUser(ctx: E2EContext, label: string) {
  const email = `${label}-${Date.now()}@acme.test`;
  const created = await request(ctx.app.getHttpServer() as Server)
    .post('/users')
    .set('x-tenant-schema', 'tenant')
    .set('x-test-user', admin)
    .send({ email, name: `${label} user`, department: 'engineering' });
  expect(created.status).toBe(201);
  await sql(ctx, 'insert into user_roles (user_id, role_id) values (?, ?)', [
    created.body.id,
    ADMIN_ROLE,
  ]);
  await rebuildPermissions(ctx.app, [created.body.id]);
  return { id: created.body.id as string, email };
}

/** Adds `count` additional grants (`Report<n>|read`) to a user. */
async function grantReports(
  ctx: E2EContext,
  userId: string,
  count: number,
  reason: string | null = null,
) {
  const now = Date.now();
  for (let index = 0; index < count; index += 1) {
    const id = uuidv7();
    await sql(
      ctx,
      'insert into capabilities (id, created_at, updated_at, action, subject, conditions, inverted, reason, fields) values (?, ?, ?, ?, ?, null, false, ?, null)',
      [id, now, now, 'read', `Report${index}`, reason],
    );
    await sql(
      ctx,
      'insert into user_additional_capabilities (user_id, capability_id) values (?, ?)',
      [userId, id],
    );
  }
  await rebuildPermissions(ctx.app, [userId]);
}

describe('permissions in the access token (e2e, express)', () => {
  let ctx: E2EContext;
  let http: Server;

  const login = (email: string) =>
    request(http)
      .post('/auths/login')
      .set('x-tenant-schema', 'tenant')
      .send({ email, code: E2E_LOGIN_CODE });
  const listUsers = (token: string) =>
    request(http)
      .get('/users')
      .set('x-tenant-schema', 'tenant')
      .set('authorization', `Bearer ${token}`);

  beforeAll(async () => {
    ctx = await bootstrapE2E({ permissionsInAccessToken: true });
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  async function rulesReader() {
    const { UserPermissionRulesReader } = await import(
      '../src/auths/persistence/user-permission-rules.reader'
    );
    return vi.spyOn(UserPermissionRulesReader.prototype, 'findOrdered');
  }

  it('authorizes an API call from the token without reading permissions', async () => {
    const user = await seedAdminUser(ctx, 'token-mode');
    const loggedIn = await login(user.email);
    expect(decodeJwt(loggedIn.body.accessToken).perms).toEqual([
      'all|manage|*',
    ]);
    const reads = await rulesReader();

    const res = await listUsers(loggedIn.body.accessToken);

    expect(res.status).toBe(200);
    expect(reads).not.toHaveBeenCalled();
    reads.mockRestore();
  });

  it('keeps an old token’s rules until the next refresh', async () => {
    const user = await seedAdminUser(ctx, 'token-change');
    const loggedIn = await login(user.email);

    await sql(ctx, 'delete from user_roles where user_id = ?', [user.id]);
    await rebuildPermissions(ctx.app, [user.id]);

    expect((await listUsers(loggedIn.body.accessToken)).status).toBe(200);
    const refreshed = await request(http)
      .post('/auths/refresh')
      .set('x-tenant-schema', 'tenant')
      .set('Cookie', cookiePair(loggedIn, 'refresh_token'));
    expect(refreshed.status).toBe(200);
    expect(decodeJwt(refreshed.body.accessToken).perms).toEqual([]);
    expect((await listUsers(refreshed.body.accessToken)).status).toBe(403);
  });

  it('falls back to reading permissions for a user whose token would be oversize', async () => {
    const user = await seedAdminUser(ctx, 'token-oversize');
    await grantReports(ctx, user.id, 200);
    const loggedIn = await login(user.email);
    expect(loggedIn.status).toBe(200);
    const { ACCESS_TOKEN_MAX_BYTES } = await import(
      '../src/common/environment/auth-token.config'
    );
    expect(loggedIn.body.accessToken.length).toBeLessThanOrEqual(
      ACCESS_TOKEN_MAX_BYTES,
    );
    expect(decodeJwt(loggedIn.body.accessToken)).not.toHaveProperty('perms');
    const reads = await rulesReader();

    expect((await listUsers(loggedIn.body.accessToken)).status).toBe(200);
    expect(reads).toHaveBeenCalledOnce();
    reads.mockRestore();
  });
});

describe('permissions in the access token (e2e, fastify cookie budget)', () => {
  let ctx: E2EContext;
  let http: Server;

  beforeAll(async () => {
    ctx = await bootstrapE2E({
      adapter: 'fastify',
      permissionsInAccessToken: true,
    });
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  /** Length of the access token the issuer produces for the user's current rules. */
  async function tokenFor(userId: string): Promise<string> {
    const { ACCESS_TOKEN_ISSUER } = await import(
      '../src/auths/application/authentication.ports'
    );
    const { USER_PERMISSION_RULES } = await import(
      '../src/auths/application/ports/user-permission-rules.port'
    );
    const { User } = await import('../src/users/domain/models/user.entity');
    const { MIKRO_ORM_CLIENT } = await import(
      '../src/persistence/mikro-orm.store'
    );
    const user = await ctx.app
      .get(MIKRO_ORM_CLIENT)
      .em.findOne(User, { id: userId }, { refresh: true });
    const permissions = await ctx.app
      .get(USER_PERMISSION_RULES)
      .findOrdered(userId);
    const { accessToken } = await ctx.app
      .get(ACCESS_TOKEN_ISSUER)
      .issue({ user, sessionId: uuidv7(), permissions });
    return accessToken;
  }

  async function setReason(capabilityId: string, length: number) {
    await sql(ctx, 'update capabilities set reason = ? where id = ?', [
      'r'.repeat(length),
      capabilityId,
    ]);
  }

  it('keeps a maximum-size permissions token within one cookie and falls back one byte over', async () => {
    const { ACCESS_TOKEN_MAX_BYTES } = await import(
      '../src/common/environment/auth-token.config'
    );
    expect(ACCESS_TOKEN_MAX_BYTES).toBe(2500);
    const user = await seedAdminUser(ctx, 'cookie-budget');
    await grantReports(ctx, user.id, 1, 'r');
    const [{ capability_id: capabilityId }] = (await sql(
      ctx,
      'select capability_id from user_additional_capabilities where user_id = ?',
      [user.id],
    )) as { capability_id: string }[];

    // Grow one rule's reason until the token is exactly the limit.
    let reason = 1;
    let token = await tokenFor(user.id);
    for (
      let step = 0;
      step < 50 && token.length !== ACCESS_TOKEN_MAX_BYTES;
      step += 1
    ) {
      const hasPerms = decodeJwt(token).perms !== undefined;
      const gap = ACCESS_TOKEN_MAX_BYTES - token.length;
      reason = hasPerms
        ? reason + Math.max(1, Math.floor((gap * 3) / 4))
        : reason - 1;
      await setReason(capabilityId, reason);
      await rebuildPermissions(ctx.app, [user.id]);
      token = await tokenFor(user.id);
    }
    expect(token.length).toBe(ACCESS_TOKEN_MAX_BYTES);

    const loggedIn = await request(http)
      .post('/auths/login')
      .set('x-tenant-schema', 'tenant')
      .send({ email: user.email, code: E2E_LOGIN_CODE });
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.body.accessToken.length).toBe(ACCESS_TOKEN_MAX_BYTES);
    expect(decodeJwt(loggedIn.body.accessToken).perms).toBeDefined();
    for (const cookie of setCookies(loggedIn)) {
      expect(Buffer.byteLength(cookie)).toBeLessThanOrEqual(4096);
    }

    const next = await request(http)
      .get('/users')
      .set('x-tenant-schema', 'tenant')
      .set('Cookie', cookiePair(loggedIn, 'session'));
    expect(next.status).toBe(200);

    await setReason(capabilityId, reason + 1);
    await rebuildPermissions(ctx.app, [user.id]);
    const over = await request(http)
      .post('/auths/login')
      .set('x-tenant-schema', 'tenant')
      .send({ email: user.email, code: E2E_LOGIN_CODE });
    expect(decodeJwt(over.body.accessToken)).not.toHaveProperty('perms');
  });
});
