/* Copyright (C) 2026-present Aristotelis — see repository license. */

import secureSession from '@fastify/secure-session';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { TRUST_PROXY } from './common/environment/auth-token.config';

/**
 * Fastify adapter honouring `TRUST_PROXY`, so `request.ip` is the client.
 * Fastify trusts no proxy for a hop count, so a numeric `TRUST_PROXY` fails boot.
 */
export function createFastifyAdapter(): FastifyAdapter {
  if (typeof TRUST_PROXY === 'number') {
    throw new Error(
      `TRUST_PROXY=${TRUST_PROXY} is a hop count, which Fastify does not support; use "true" or an address list such as "loopback, 10.0.0.0/8".`,
    );
  }
  return new FastifyAdapter(
    TRUST_PROXY === undefined ? undefined : { trustProxy: TRUST_PROXY },
  );
}

/**
 * Registers the encrypted session cookie; it also registers `@fastify/cookie`,
 * which provides `request.cookies` and `reply.setCookie`.
 */
export async function registerSecureSession(
  app: NestFastifyApplication,
  secretHex: string,
): Promise<void> {
  await app
    .getHttpAdapter()
    .getInstance()
    .register(secureSession, {
      key: Buffer.from(secretHex, 'hex'),
      cookieName: 'session',
      cookie: {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
      },
    });
}
