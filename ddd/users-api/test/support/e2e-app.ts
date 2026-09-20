/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCapabilityString } from '@nestjs-pipeline/casl';
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

/** 32-byte hex key for the Fastify secure-session cookie in e2e runs. */
const E2E_SESSION_SECRET = 'a'.repeat(64);

/** The symmetric secret used to sign and verify e2e session JWTs. */
export const E2E_JWT_SECRET = 'e2e-jwt-secret-please-do-not-use-in-prod';

/** Default API clients for API Key authentication tests. */
export const E2E_API_CLIENTS = [
  {
    id: 'api-admin-client',
    name: 'Admin Client',
    key: 'admin-secret-key-12345',
    tenants: ['tenant', 'tenant_a', 'tenant_b'],
    rules: ['all|manage|*'],
  },
  {
    id: 'api-read-only-client',
    name: 'Read Only Client',
    key: 'readonly-secret-key-12345',
    tenants: ['tenant', 'tenant_a', 'tenant_b'],
    rules: ['User|read|*', 'Role|read|*'],
  },
];

export interface E2EOptions {
  tenants?: string[];
  /** HTTP platform to boot; Express by default. */
  adapter?: 'express' | 'fastify';
  /** `TRUST_PROXY` for this application; unset by default. */
  trustProxy?: string;
  /** `PERMISSIONS_IN_ACCESS_TOKEN` for this application; off by default. */
  permissionsInAccessToken?: boolean;
  /** `ACCESS_TOKEN_MAX_BYTES` for this application; the default otherwise. */
  accessTokenMaxBytes?: number;
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
  tenant?: string;
  secret?: string;
  expiresIn?: string | number;
}): Promise<string> {
  const secret = new TextEncoder().encode(options?.secret ?? E2E_JWT_SECRET);
  const jwt = new SignJWT({
    tenant: options?.tenant ?? 'tenant',
    email: options?.email ?? 'jwt-user@acme.test',
    department: options?.department ?? 'engineering',
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

  // Credentials the auth use case reads at request time. Exercise the same
  // production-safe hashed login-code path used by deployed configuration.
  delete process.env.AUTH_LOGIN_CODE;
  process.env.AUTH_LOGIN_CODE_SHA256 = createHash('sha256')
    .update(E2E_LOGIN_CODE, 'utf8')
    .digest('hex');
  process.env.JWT_SECRET = E2E_JWT_SECRET;
  if (options?.trustProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = options.trustProxy;
  process.env.PERMISSIONS_IN_ACCESS_TOKEN = options?.permissionsInAccessToken
    ? 'true'
    : 'false';
  if (options?.accessTokenMaxBytes === undefined) {
    delete process.env.ACCESS_TOKEN_MAX_BYTES;
  } else {
    process.env.ACCESS_TOKEN_MAX_BYTES = String(options.accessTokenMaxBytes);
  }
  process.env.API_CLIENTS = JSON.stringify(
    options?.apiClients ?? E2E_API_CLIENTS,
  );

  // 1. Run migrations to establish the exact production database schema and seed data.
  const { migrate } = await import('@persistence/migrate');
  await migrate();
  const { verifyUserPermissions } = await import(
    '@persistence/verify-user-permissions'
  );
  for (const [tenant, drifted] of await verifyUserPermissions()) {
    if (drifted.length > 0) {
      throw new Error(
        `Permission rules drifted after seeding in ${tenant}: ${drifted.join(', ')}`,
      );
    }
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

  let app: INestApplication;
  if (options?.adapter === 'fastify') {
    const platform = await import('../../src/http-platform');
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      platform.createFastifyAdapter(),
    );
    await platform.registerSecureSession(
      app as NestFastifyApplication,
      E2E_SESSION_SECRET,
    );
  } else {
    const { configureExpress } = await import('../../src/express-platform');
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureExpress(app as NestExpressApplication);
  }

  // Inject a Fastify-secure-session-compatible shim from the test header.
  if (options?.adapter === 'fastify') {
    (app as NestFastifyApplication)
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', async (req) => {
        const headers = req.headers as Record<
          string,
          string | string[] | undefined
        >;
        if (usesTestSession(headers)) {
          (req as { session?: unknown }).session = testSession(headers);
        }
      });
  } else {
    app.use(
      (
        req: {
          headers: Record<string, string | string[] | undefined>;
          session?: unknown;
        },
        _res: unknown,
        next: () => void,
      ) => {
        if (usesTestSession(req.headers)) {
          req.session = testSession(req.headers);
        }
        next();
      },
    );
  }

  app.useGlobalFilters(
    new ZodValidationFilter(),
    new FeatureDisabledFilter(),
    new RateLimitExceededFilter(),
    new IdempotencyConflictFilter(),
    new UnauthorizedActionFilter(),
    new DomainExceptionFilter(),
  );
  await app.init();
  if (options?.adapter === 'fastify') {
    await (app as NestFastifyApplication)
      .getHttpAdapter()
      .getInstance()
      .ready();
  }

  const close = async (): Promise<void> => {
    // Event handlers enqueue BullMQ jobs after the HTTP response; let them reach
    // Redis before shutdown closes the connection underneath them.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await app.close();
    await redis.stop();
    rmSync(dir, { recursive: true, force: true });
  };

  return { app, close };
}

/** Requests without test headers keep the adapter's real session handling. */
function usesTestSession(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  return (
    headers['x-test-user'] !== undefined ||
    headers['x-test-token'] !== undefined
  );
}

/**
 * A session object shaped like `@fastify/secure-session`, fed from the
 * `x-test-user` and `x-test-token` headers. `grants` are capability strings,
 * parsed the way an authenticator attaches them.
 */
function testSession(
  headers: Record<string, string | string[] | undefined>,
): unknown {
  const raw = headers['x-test-user'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  const parsedUser = header ? JSON.parse(header) : undefined;
  const rawTenant = headers['x-tenant-schema'];
  const tenant = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant;
  const user = parsedUser
    ? {
        ...parsedUser,
        tenant: parsedUser.tenant ?? tenant,
        principalType:
          parsedUser.principalType !== undefined
            ? parsedUser.principalType
            : parsedUser.grants
              ? 'service'
              : 'user',
        ...(parsedUser.grants
          ? { grants: parsedUser.grants.map(parseCapabilityString) }
          : {}),
      }
    : undefined;
  const rawToken = headers['x-test-token'];
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const store: Record<string, unknown> = {
    ...(user ? { user } : {}),
    ...(token ? { token } : {}),
  };
  const sessionObj = {
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
  return new Proxy(sessionObj, {
    get(target, prop: string) {
      if (prop in target) {
        return Reflect.get(target, prop);
      }
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
}

/**
 * Rebuilds the materialized permission rules of `userIds`, as every writer of
 * `user_roles` or other permission inputs must, for tests that write those
 * tables directly.
 */
export async function rebuildPermissions(
  app: INestApplication,
  userIds: string[],
): Promise<void> {
  const { MIKRO_ORM_CLIENT } = await import('@persistence/mikro-orm.store');
  const { UserPermissionsProjector } = await import(
    '../../src/auths/persistence/user-permissions.projector'
  );
  const projector = app.get(UserPermissionsProjector);
  await app
    .get(MIKRO_ORM_CLIENT)
    .transactional((em: never) => projector.rebuild(em, userIds));
}
