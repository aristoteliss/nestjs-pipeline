/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: placeholders are data */
import { Logger, UnauthorizedException } from '@nestjs/common';
import type { Capability } from '@nestjs-pipeline/casl';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { decodeJwt, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../users/domain/models/user.entity';

const SECRET = 'permissions-in-token-secret';
const SESSION = '019488e0-0000-7000-8000-0000000000aa';

const rules: Capability[] = [
  { subject: 'User', action: 'read' },
  {
    subject: 'User',
    action: 'update',
    conditions: { department: '${user.department}' },
    fields: ['username'],
  },
  { subject: 'User', action: 'read', fields: ['email'], inverted: true },
  { subject: 'User', action: 'delete', inverted: true },
];

async function load(env: Record<string, string>) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.resetModules();
  const { JoseAccessTokenIssuer } = await import('./jose-access-token.issuer');
  const { JwtAuthenticator } = await import('../services/jwt-authenticator');
  return { JoseAccessTokenIssuer, JwtAuthenticator };
}

describe('permissions carried in the access token', () => {
  const tenant = new TenantSchemaContext();
  const user = User.create('Alice', 'alice@example.test', 'engineering');

  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', SECRET);
    vi.stubEnv('JWT_PUBLIC_KEY', undefined);
    vi.stubEnv('JWT_ALGORITHMS', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('issuer', () => {
    it('adds perms in port order and the department when given rules', async () => {
      const { JoseAccessTokenIssuer } = await load({});

      const { accessToken } = await new JoseAccessTokenIssuer(tenant).issue({
        user,
        sessionId: SESSION,
        permissions: rules,
      });

      const payload = decodeJwt(accessToken);
      expect(payload.department).toBe('engineering');
      expect(payload.perms).toEqual([
        'User|read|*',
        'User|update|{"department":"${user.department}"}|username',
        '!User|read|*|email',
        '!User|delete|*',
      ]);
    });

    it('adds neither claim without rules', async () => {
      const { JoseAccessTokenIssuer } = await load({});

      const { accessToken } = await new JoseAccessTokenIssuer(tenant).issue({
        user,
        sessionId: SESSION,
      });

      const payload = decodeJwt(accessToken);
      expect(payload).not.toHaveProperty('perms');
      expect(payload).not.toHaveProperty('department');
    });

    it('re-issues an oversize token without permissions and logs no token or rule text', async () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      const { JoseAccessTokenIssuer } = await load({
        ACCESS_TOKEN_MAX_BYTES: '1024',
      });
      const many: Capability[] = Array.from({ length: 40 }, (_, index) => ({
        subject: `Report${index}`,
        action: 'read',
      }));

      const { accessToken } = await new JoseAccessTokenIssuer(tenant).issue({
        user,
        sessionId: SESSION,
        permissions: many,
      });

      expect(accessToken.length).toBeLessThanOrEqual(1024);
      expect(decodeJwt(accessToken)).not.toHaveProperty('perms');
      expect(warn).toHaveBeenCalledOnce();
      const [message] = warn.mock.calls[0] as [string];
      expect(message).toContain(user.id);
      expect(message).toContain('40 rule(s)');
      expect(message).not.toContain('Report');
      expect(message).not.toContain(accessToken);
    });
  });

  describe('authenticator', () => {
    const tokenWith = (claims: Record<string, unknown>) =>
      new SignJWT({ tenant: tenant.schema, principalType: 'user', ...claims })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode(SECRET));

    it('maps valid perms to grants and the department when enabled', async () => {
      const { JwtAuthenticator } = await load({
        PERMISSIONS_IN_ACCESS_TOKEN: 'true',
      });
      const token = await tokenWith({
        department: 'engineering',
        perms: ['User|read|*', '!User|delete|*'],
      });

      const principal = await new JwtAuthenticator(tenant).authenticate({
        headers: { authorization: `Bearer ${token}` },
      });

      expect(principal).toMatchObject({
        id: user.id,
        department: 'engineering',
        grants: [
          { subject: 'User', action: 'read' },
          { subject: 'User', action: 'delete', inverted: true },
        ],
      });
    });

    it.each([
      ['a malformed entry', ['User']],
      ['a non-string entry', [{ subject: 'User', action: 'read' }]],
      ['a non-array claim', 'User|read|*'],
    ])('rejects %s with 401 when enabled', async (_, perms) => {
      const { JwtAuthenticator } = await load({
        PERMISSIONS_IN_ACCESS_TOKEN: 'true',
      });
      const token = await tokenWith({ perms });

      await expect(
        new JwtAuthenticator(tenant).authenticate({
          headers: { authorization: `Bearer ${token}` },
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('ignores perms and department when disabled', async () => {
      const { JwtAuthenticator } = await load({
        PERMISSIONS_IN_ACCESS_TOKEN: 'false',
      });
      const token = await tokenWith({
        department: 'engineering',
        perms: ['all|manage|*'],
      });

      const principal = await new JwtAuthenticator(tenant).authenticate({
        headers: { authorization: `Bearer ${token}` },
      });

      expect(principal).not.toHaveProperty('grants');
      expect(principal).not.toHaveProperty('department');
    });
  });
});
