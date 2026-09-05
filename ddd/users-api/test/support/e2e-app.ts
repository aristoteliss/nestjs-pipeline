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

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';
import { SignJWT } from 'jose';

/**
 * The login code the e2e auth flow accepts (see `AUTH_LOGIN_CODE`). The login
 * DTO caps the code at six characters, so keep this short.
 */
export const E2E_LOGIN_CODE = '424242';

/** The symmetric secret used to sign and verify e2e session JWTs. */
export const E2E_JWT_SECRET = 'e2e-jwt-secret-please-do-not-use-in-prod';

/** Default API clients for API Key authentication tests. */
export const E2E_API_CLIENTS = [
  {
    id: 'api-admin-client',
    name: 'Admin Client',
    key: 'admin-secret-key-12345',
    tenants: ['tenant', 'tenant_a', 'tenant_b'],
    capabilities: {
      roles: [],
      additionalCapabilities: ['all|manage|*'],
    },
  },
  {
    id: 'api-read-only-client',
    name: 'Read Only Client',
    key: 'readonly-secret-key-12345',
    tenants: ['tenant', 'tenant_a', 'tenant_b'],
    capabilities: {
      roles: [],
      additionalCapabilities: ['User|read|*', 'Role|read|*'],
    },
  },
];

export interface E2EOptions {
  tenants?: string[];
  apiClients?: typeof E2E_API_CLIENTS;
}

export interface E2EContext {
  app: INestApplication;
  close: () => Promise<void>;
}

/**
 * Helper to generate signed JWTs for Bearer authentication tests.
 */
export async function createTestJwt(options?: {
  sub?: string;
  email?: string;
  department?: string;
  roles?: string[];
  additionalCapabilities?: string[];
  deniedCapabilities?: string[];
  tenant?: string;
  secret?: string;
  expiresIn?: string | number;
}): Promise<string> {
  const secret = new TextEncoder().encode(options?.secret ?? E2E_JWT_SECRET);
  const jwt = new SignJWT({
    tenant: options?.tenant ?? 'tenant',
    email: options?.email ?? 'jwt-user@acme.test',
    department: options?.department ?? 'engineering',
    roles: options?.roles ?? [],
    additionalCapabilities: options?.additionalCapabilities ?? ['all|manage|*'],
    deniedCapabilities: options?.deniedCapabilities ?? [],
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(options?.sub ?? 'jwt-user-1')
    .setIssuedAt();

  if (options?.expiresIn !== undefined) {
    jwt.setExpirationTime(options.expiresIn);
  } else {
    jwt.setExpirationTime('2h');
  }

  return await jwt.sign(secret);
}

/**
 * Boots the real {@link AppModule} for functional testing against disposable
 * infrastructure:
 *
 * - a throwaway libSQL database file (schema created from the entity metadata),
 * - a disposable Redis instance started with Testcontainers (BullMQ queues +
 *   the cache behavior connect to it).
 *
 * The authenticated principal is supplied through the `x-test-user` request
 * header, which a small middleware turns into a session the production
 * authentication interceptor reads; every other layer runs as in production.
 *
 * Environment variables are configured **before** `AppModule` is imported,
 * because several modules (`BullModule`, `CacheModule`) read connection details
 * at module-evaluation time. All imports are therefore dynamic.
 */
export async function bootstrapE2E(options?: E2EOptions): Promise<E2EContext> {
  const redis: StartedRedisContainer = await new RedisContainer(
    'redis:7-alpine',
  ).start();

  const dir = mkdtempSync(join(tmpdir(), 'users-api-e2e-'));

  process.env.NODE_ENV = 'production'; // quiet logs + disable MikroORM SQL debug
  process.env.REDIS_HOST = redis.getHost();
  process.env.REDIS_PORT = String(redis.getMappedPort(6379));
  process.env.DATABASE_URL = `file:${join(dir, 'e2e.db')}`;
  process.env.DB_ENGINE = 'libsql';
  // Configure tenant schemas.
  const tenantList = options?.tenants ?? ['tenant', 'tenant_a', 'tenant_b'];
  process.env.DB_DEFAULT_SCHEMA = tenantList[0] ?? 'tenant';
  process.env.SQLITE_TENANTS = tenantList.join(',');

  // Credentials the auth use case reads at request time.
  process.env.AUTH_LOGIN_CODE = E2E_LOGIN_CODE;
  process.env.JWT_SECRET = E2E_JWT_SECRET;
  process.env.API_CLIENTS = JSON.stringify(
    options?.apiClients ?? E2E_API_CLIENTS,
  );

  // 1. Create the schema in the exact database file(s) the app will open.
  const { MikroORM, SchemaGenerator } = await import('@mikro-orm/libsql');
  const { createLibsqlOrmOptions, resolveLibsqlDbUrl, resolveLibsqlTenants } =
    await import('@persistence/libsql-options');

  const tenants = resolveLibsqlTenants();
  for (const tenant of tenants) {
    const baseOptions = createLibsqlOrmOptions(resolveLibsqlDbUrl(tenant));
    const orm = await MikroORM.init({
      ...baseOptions,
      // MikroORM 7 requires the schema generator to be registered explicitly.
      extensions: [...(baseOptions.extensions ?? []), SchemaGenerator],
    });
    await orm.schema.create();
    await orm.close();
  }

  // 2. Build the Nest application. The production AuthSessionInterceptor reads
  //    the authenticated principal from `req.session.get('user')`. We feed that
  //    session from the `x-test-user` header (see below) so the request flows
  //    through the real authentication + authorization pipeline unchanged.
  const { Test } = await import('@nestjs/testing');
  const { ZodValidationFilter } = await import('@nestjs-pipeline/zod');
  const { RateLimitExceededFilter } = await import(
    '@nestjs-pipeline/rate-limit'
  );
  const { IdempotencyConflictFilter } = await import(
    '@nestjs-pipeline/idempotency'
  );
  const { AppModule } = await import('../../src/app.module');
  const { FeatureDisabledFilter } = await import(
    '../../src/common/filters/feature-disabled.filter'
  );
  const { UnauthorizedActionFilter } = await import(
    '../../src/common/filters/unauthorized-action.filter'
  );
  const { DomainExceptionFilter } = await import(
    '../../src/common/filters/domain-exception.filter'
  );

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  // Inject a Fastify-secure-session-compatible shim from the test header.
  app.use(
    (
      req: {
        headers: Record<string, string | string[] | undefined>;
        session?: unknown;
      },
      _res: unknown,
      next: () => void,
    ) => {
      const raw = req.headers['x-test-user'];
      const header = Array.isArray(raw) ? raw[0] : raw;
      const parsedUser = header ? JSON.parse(header) : undefined;
      const rawTenant = req.headers['x-tenant-schema'];
      const tenant = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant;
      const user = parsedUser
        ? { ...parsedUser, tenant: parsedUser.tenant ?? tenant }
        : undefined;
      const store: Record<string, unknown> = user ? { user } : {};
      req.session = {
        get: (key: string) => store[key],
        set: (key: string, value: unknown) => {
          store[key] = value;
        },
        delete: () => {
          for (const key of Object.keys(store)) {
            delete store[key];
          }
        },
      };
      next();
    },
  );

  app.useGlobalFilters(
    new ZodValidationFilter(),
    new FeatureDisabledFilter(),
    new RateLimitExceededFilter(),
    new IdempotencyConflictFilter(),
    new UnauthorizedActionFilter(),
    new DomainExceptionFilter(),
  );
  await app.init();

  // MikroORM derives each entity's `validateProps` while the metadata is
  // synced. When the sources are compiled with SWC, the EntitySchema scalar
  // `kind` is resolved early enough that the timestamp columns (mapped as
  // `number` but holding `Date` values that MikroORM coerces on write) land in
  // `validateProps`, making the unit-of-work throw a spurious "wrong property
  // type" error before the value is converted. Under the production toolchain
  // the same props are computed before their `kind` is set, so the list stays
  // empty and the write succeeds. Clear it here so the test toolchain matches
  // production runtime behaviour without touching application code.
  const { MIKRO_ORM_CLIENT } = await import('@persistence/mikro-orm.store');
  const store = app.get<{
    orm: {
      getMetadata(): { getAll(): Map<unknown, { validateProps: unknown[] }> };
    };
  }>(MIKRO_ORM_CLIENT);
  for (const meta of store.orm.getMetadata().getAll().values()) {
    meta.validateProps = [];
  }

  const close = async (): Promise<void> => {
    await app.close();
    await redis.stop();
    rmSync(dir, { recursive: true, force: true });
  };

  return { app, close };
}
