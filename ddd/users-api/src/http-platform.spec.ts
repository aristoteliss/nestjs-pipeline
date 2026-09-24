/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { randomBytes, randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionService } from './auths/services/session.service';
import { ACCESS_TOKEN_MAX_BYTES } from './common/environment/auth-token.config';
import { createFastifyAdapter, registerSecureSession } from './http-platform';

/** Browsers may drop a cookie whose `Set-Cookie` header is larger than this. */
const COOKIE_LIMIT_BYTES = 4096;

describe('registerSecureSession', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({}).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter(),
      { logger: false },
    );
    await registerSecureSession(app, randomBytes(32).toString('hex'));
    const sessions = new SessionService();
    app
      .getHttpAdapter()
      .getInstance()
      .post('/login', async (request) => {
        sessions.saveSession(
          request.session,
          {
            id: randomUUID(),
            principalType: 'user',
            tenant: 'tenant',
            email: 'user@example.test',
            accessToken: 'a'.repeat(ACCESS_TOKEN_MAX_BYTES),
            accessTokenExpiresAt: Date.now() + 300_000,
          },
          randomUUID(),
        );
        return {};
      });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps a login session with a maximum-size access token within one cookie', async () => {
    // The cookie holds base64 ciphertext and is URL-encoded, so every `+` and `/`
    // costs three bytes and the length changes with each encryption. One login
    // proves little: at a budget without headroom, about 1% of logins overflow.
    const sizes: number[] = [];
    for (let login = 0; login < 1000; login += 1) {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({ method: 'POST', url: '/login' });
      const cookie = [response.headers['set-cookie']]
        .flat()
        .find(
          (value): value is string =>
            typeof value === 'string' && value.startsWith('session='),
        );
      sizes.push(Buffer.byteLength(cookie ?? ''));
    }

    expect(Math.min(...sizes)).toBeGreaterThan(ACCESS_TOKEN_MAX_BYTES);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(COOKIE_LIMIT_BYTES);
  });
});
