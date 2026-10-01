/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { randomBytes, randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Auth } from './auths/domain/models/auth.entity.js';
import { SessionService } from './auths/services/session.service.js';
import { httpExchangeStore } from './common/context/http-exchange.store.js';
import { ACCESS_TOKEN_MAX_BYTES } from './common/environment/auth-token.config.js';
import {
  createFastifyAdapter,
  registerSecureSession,
} from './http-platform.js';

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
      .post('/login', async (request, reply) => {
        const userId = randomUUID();
        const sessionExpiresAt = Date.now() + 3_600_000;
        httpExchangeStore.run(
          { session: request.session, response: reply },
          () =>
            sessions.save({
              aggregate: Auth.create(userId, 'hash', sessionExpiresAt),
              userId,
              principalType: 'user',
              tenant: 'tenant',
              email: 'user@example.test',
              accessToken: 'a'.repeat(ACCESS_TOKEN_MAX_BYTES),
              accessTokenExpiresAt: Date.now() + 300_000,
              sessionExpiresAt,
            }),
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

describe('createFastifyAdapter', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('refuses a hop-count TRUST_PROXY, which Fastify would trust no proxy for', async () => {
    vi.stubEnv('TRUST_PROXY', '1');
    vi.resetModules();
    const platform = await import('./http-platform.js');

    expect(() => platform.createFastifyAdapter()).toThrow(
      'TRUST_PROXY=1 is a hop count',
    );
  });

  it('takes the client address from a trusted proxy in the address list', async () => {
    vi.stubEnv('TRUST_PROXY', 'loopback');
    vi.resetModules();
    const platform = await import('./http-platform.js');
    const fastify = platform.createFastifyAdapter().getInstance();
    fastify.get('/ip', async (request) => ({ ip: request.ip }));

    const response = await fastify.inject({
      url: '/ip',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    await fastify.close();

    expect(response.json()).toEqual({ ip: '203.0.113.7' });
  });
});
