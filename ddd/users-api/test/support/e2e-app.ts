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

export const E2E_LOGIN_CODE = '424242';
export const E2E_JWT_SECRET = 'e2e-jwt-secret-please-do-not-use-in-prod';

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

/** Helper to generate signed JWTs for Bearer authentication tests. */
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

  if (options?.expiresIn !== undefined) jwt.setExpirationTime(options.expiresIn);
  else jwt.setExpirationTime('2h');

  return await jwt.sign(secret);
}

/**
 * Boots the real AppModule against disposable libSQL + Redis infrastructure.
 *
 * `x-test-user` represents a synthetic external/test principal. For backwards
 * compatibility with existing E2E fixtures the shim assigns
 * `principalType: 'service'` when the fixture does not provide one explicitly;
 * production authentication never relies on this default.
 */
export async function bootstrapE2E(options?: E2EOptions): Promise<E2EContext> {
  const redis: StartedRedisContainer = await new RedisContainer(
    'redis:7-alpine',
  ).start();
  const dir = mkdtempSync(join(tmpdir(), 'users-api-e2e-'));

  process.env.NODE_ENV = 'production';
  process.env.REDIS_HOST = redis.getHost();
  process.env.REDIS_PORT = String(redis.getMappedPort(6379));
  process.env.DATABASE_URL = `file:${join(dir, 'e2e.db')}`;
  process.env.DB_ENGINE = 'libsql';
  const tenantList = options?.tenants ?? ['tenant', 'tenant_a', 'tenant_b'];
  process.env.DB_DEFAULT_SCHEMA = tenantList[0] ?? 'tenant';
  process.env.SQLITE_TENANTS = tenantList.join(',');
  process.env.AUTH_LOGIN_CODE = E2E_LOGIN_CODE;
  process.env.JWT_SECRET = E2E_JWT_SECRET;
  process.env.API_CLIENTS = JSON.stringify(
    options?.apiClients ?? E2E_API_CLIENTS,
  );

  const { migrate } = await import('@persistence/migrate');
  await migrate();

  const { Test } = await import('@nestjs/testing');
  const { ZodValidationFilter } = await import('@nestjs-pipeline/zod');
  const { RateLimitExceededFilter } = await import('@nestjs-pipeline/rate-limit');
  const { IdempotencyConflictFilter } = await import('@nestjs-pipeline/idempotency');
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

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();

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
        ? {
            ...parsedUser,
            tenant: parsedUser.tenant ?? tenant,
            principalType: parsedUser.principalType ?? 'service',
          }
        : undefined;
      const store: Record<string, unknown> = user ? { user } : {};
      const sessionObj = {
        get: (key: string) => store[key],
        set: (key: string, value: unknown) => {
          store[key] = value;
        },
        delete: () => {
          for (const key of Object.keys(store)) delete store[key];
        },
      };
      req.session = new Proxy(sessionObj, {
        get(target, prop: string) {
          if (prop in target) return Reflect.get(target, prop);
          return store[prop];
        },
        set(target, prop: string, value: unknown) {
          if (prop in target) {
            Reflect.set(target, prop, value);
            return true;
          }
          store[prop] = value;
          return true;
        },
      });
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

  const close = async (): Promise<void> => {
    await app.close();
    await redis.stop();
    rmSync(dir, { recursive: true, force: true });
  };

  return { app, close };
}
