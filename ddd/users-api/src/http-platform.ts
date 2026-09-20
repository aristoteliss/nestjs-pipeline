/* Copyright (C) 2026-present Aristotelis — see repository license. */

import secureSession from '@fastify/secure-session';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { TRUST_PROXY } from './common/environment/auth-token.config';

/** Fastify adapter honouring `TRUST_PROXY`, so `request.ip` is the client. */
export function createFastifyAdapter(): FastifyAdapter {
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
