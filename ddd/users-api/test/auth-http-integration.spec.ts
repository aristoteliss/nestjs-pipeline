/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { AUTH_HEADERS } from '@common/constants/auth-headers.constants';
import { getSessionUserFromStore } from '@common/context/session-user.store';
import { AuthSessionGuard } from '@common/guards/auth-session.guard';
import { SessionUserContextInterceptor } from '@common/interceptors/session-user-context.interceptor';
import {
  Controller,
  Get,
  type INestApplication,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  Query,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClientAuthenticator } from '../src/auths/services/api-client-authenticator';
import { JwtAuthenticator } from '../src/auths/services/jwt-authenticator';
import { RequestPrincipalResolver } from '../src/auths/services/request-principal-resolver';
import { TenantSchemaMiddleware } from '../src/persistence/middlewares/tenant-schema.middleware';

@Controller('test-auth')
class TestAuthController {
  @Get('principal')
  async getPrincipal() {
    await Promise.resolve();
    return getSessionUserFromStore() ?? { anonymous: true };
  }

  @Get('concurrent')
  async getConcurrent(@Query('delay') delayStr: string) {
    const delay = parseInt(delayStr, 10) || 10;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return {
      user: getSessionUserFromStore(),
      schema: TenantSchemaContext.currentSchema,
    };
  }
}

@Module({
  controllers: [TestAuthController],
  providers: [
    TenantSchemaContext,
    TenantSchemaMiddleware,
    JwtAuthenticator,
    ApiClientAuthenticator,
    RequestPrincipalResolver,
    { provide: APP_GUARD, useClass: AuthSessionGuard },
    { provide: APP_INTERCEPTOR, useClass: SessionUserContextInterceptor },
  ],
})
class TestAuthModule implements NestModule {
  constructor(private readonly tenantMiddleware: TenantSchemaMiddleware) {}
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(this.tenantMiddleware.use.bind(this.tenantMiddleware))
      .forRoutes('*');
  }
}

describe('HTTP Authentication Integration (Real Nest App Pipeline)', () => {
  let app: INestApplication;
  const jwtSecret = 'integration-test-jwt-secret-key-32b!';

  beforeAll(async () => {
    process.env.SQLITE_TENANTS = 'tenant_a,tenant_b';
    process.env.JWT_SECRET = jwtSecret;
    delete process.env.JWT_PUBLIC_KEY;
    process.env.API_CLIENTS = JSON.stringify([
      {
        id: 'trusted-client',
        key: 'client-api-key-999',
        tenant: 'tenant_a',
        capabilities: { roles: ['service-integration'] },
      },
    ]);

    const moduleRef = await Test.createTestingModule({
      imports: [TestAuthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('1. Valid Bearer JWT -> 200 with principal resolved inside controller', async () => {
    const token = await new SignJWT({
      tenant: 'tenant_a',
      email: 'bearer-user@acme.test',
      roles: ['editor'],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-bearer-valid')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(jwtSecret));

    const res = await request(app.getHttpServer())
      .get('/test-auth/principal')
      .set(AUTH_HEADERS.TENANT_SCHEMA, 'tenant_a')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'user-bearer-valid',
      email: 'bearer-user@acme.test',
      tenant: 'tenant_a',
      capabilities: { roles: ['editor'] },
    });
  });

  it('2. Expired or malformed Bearer JWT -> 401 Unauthorized', async () => {
    const expiredToken = await new SignJWT({
      tenant: 'tenant_a',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-expired')
      .setExpirationTime('-1h')
      .sign(new TextEncoder().encode(jwtSecret));

    const res = await request(app.getHttpServer())
      .get('/test-auth/principal')
      .set(AUTH_HEADERS.TENANT_SCHEMA, 'tenant_a')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
  });

  it('3. Wrong-tenant Bearer JWT -> 401 Unauthorized', async () => {
    const tokenForTenantB = await new SignJWT({
      tenant: 'tenant_b',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-b')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(jwtSecret));

    const res = await request(app.getHttpServer())
      .get('/test-auth/principal')
      .set(AUTH_HEADERS.TENANT_SCHEMA, 'tenant_a')
      .set('Authorization', `Bearer ${tokenForTenantB}`);

    expect(res.status).toBe(401);
  });

  it('4. Valid API key -> 200 with principal resolved inside controller', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-auth/principal')
      .set(AUTH_HEADERS.TENANT_SCHEMA, 'tenant_a')
      .set(AUTH_HEADERS.API_ID, 'trusted-client')
      .set(AUTH_HEADERS.API_KEY, 'client-api-key-999');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'trusted-client',
      tenant: 'tenant_a',
      capabilities: { roles: ['service-integration'] },
    });
  });

  it('5. Valid API key + wrong tenant -> 401 Unauthorized', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-auth/principal')
      .set(AUTH_HEADERS.TENANT_SCHEMA, 'tenant_b')
      .set(AUTH_HEADERS.API_ID, 'trusted-client')
      .set(AUTH_HEADERS.API_KEY, 'client-api-key-999');

    expect(res.status).toBe(401);
  });

  it('6. Concurrent HTTP requests maintain strict AsyncLocalStorage isolation across async turns in controller', async () => {
    const tokenA = await new SignJWT({
      tenant: 'tenant_a',
      roles: ['admin'],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-concurrent-a')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(jwtSecret));

    const tokenB = await new SignJWT({
      tenant: 'tenant_b',
      roles: ['guest'],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-concurrent-b')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(jwtSecret));

    // Request A starts first and delays 25ms, Request B starts second and delays 5ms
    const reqA = request(app.getHttpServer())
      .get('/test-auth/concurrent?delay=25')
      .set(AUTH_HEADERS.TENANT_SCHEMA, 'tenant_a')
      .set('Authorization', `Bearer ${tokenA}`);

    const reqB = request(app.getHttpServer())
      .get('/test-auth/concurrent?delay=5')
      .set(AUTH_HEADERS.TENANT_SCHEMA, 'tenant_b')
      .set('Authorization', `Bearer ${tokenB}`);

    const [resA, resB] = await Promise.all([reqA, reqB]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    expect(resA.body).toEqual({
      user: expect.objectContaining({
        id: 'user-concurrent-a',
        tenant: 'tenant_a',
      }),
      schema: 'tenant_a',
    });

    expect(resB.body).toEqual({
      user: expect.objectContaining({
        id: 'user-concurrent-b',
        tenant: 'tenant_b',
      }),
      schema: 'tenant_b',
    });
  });
});
