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

import { sessionUserStore } from '@common/context/session-user.store';
import { Session } from '@fastify/secure-session';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type Capability,
  type CapabilityString,
  serializeCapability,
  type UserCapabilities,
} from '@nestjs-pipeline/casl';
import { importSPKI, jwtVerify } from 'jose';
import { from, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { type SessionData, SessionUser } from '../types/SessionUser';

/**
 * Interceptor that populates the Fastify secure session from:
 *
 * 1. An existing session cookie (automatic — handled by @fastify/secure-session)
 * 2. A Bearer JWT in the `Authorization` header (verified)
 * 3. The `x-api-id` header for API-client authentication
 *
 * Why an Interceptor instead of a Middleware?
 * NestJS middleware with Fastify runs through @fastify/middie and receives the
 * raw Node.js IncomingMessage — not the Fastify request — so `req.session` is
 * undefined. Interceptors use `context.switchToHttp().getRequest()`, which returns
 * the actual Fastify request with the session decoration.
 *
 * JWT verification supports:
 * - `JWT_SECRET` for symmetric algorithms (e.g. HS256)
 * - `JWT_PUBLIC_KEY` (+ optional `JWT_PUBLIC_KEY_ALG`) for asymmetric algorithms (e.g. RS256)
 * - Optional `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_ALGORITHMS`
 */
@Injectable()
export class AuthSessionInterceptor implements NestInterceptor {
  private readonly encoder = new TextEncoder();
  private readonly logger = new Logger(AuthSessionInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      session?: Session<SessionData>;
    }>();

    const session = req.session;
    if (!session) {
      return sessionUserStore.run(undefined, () => next.handle());
    }

    // If session already has a user (from cookie), skip
    const existingUser = session.get('user');
    if (existingUser) {
      return sessionUserStore.run(existingUser, () => next.handle());
    }

    return from(this.enrichSessionFromRequest(req, session)).pipe(
      switchMap((sessionUser) => {
        return sessionUserStore.run(sessionUser, () => next.handle());
      }),
    );
  }

  private async enrichSessionFromRequest(
    req: { headers?: Record<string, string | string[] | undefined> },
    session: Session<SessionData>,
  ): Promise<SessionUser | undefined> {
    const rawAuthorization = req.headers?.authorization;
    const authHeader = Array.isArray(rawAuthorization)
      ? rawAuthorization[0]
      : rawAuthorization;

    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const sessionUser = await this.verifyAndSetSessionUser(token, session);

      if (sessionUser) {
        this.logger.debug(
          `Authenticated user ${sessionUser.id} from Bearer token`,
        );
        return sessionUser;
      }
    }

    // TODO API header support
    const apiId = req.headers?.['x-api-id'];
    const normalizedAppId = Array.isArray(apiId) ? apiId[0] : apiId;
    if (typeof normalizedAppId === 'string' && normalizedAppId.length > 0) {
      session.set('api', { id: normalizedAppId });
      this.logger.debug(
        `Authenticated API client ${normalizedAppId} from x-api-id header`,
      );
    }
    return;
  }

  private async verifyAndSetSessionUser(
    token: string,
    session: Session<SessionData>,
  ): Promise<SessionUser | null> {
    const key = await this.getJwtVerificationKey();
    if (!key) return null;

    const issuer = process.env.JWT_ISSUER;
    const audience = process.env.JWT_AUDIENCE;
    const allowedAlgorithms = (process.env.JWT_ALGORITHMS ?? 'HS256')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);

    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: allowedAlgorithms,
        issuer,
        audience,
      });

      if (typeof payload.sub !== 'string' || payload.sub.length === 0)
        return null;

      const user: SessionUser = {
        id: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        tenantId:
          typeof payload.tenantId === 'string' ? payload.tenantId : undefined,
        department:
          typeof payload.department === 'string'
            ? payload.department
            : undefined,
        capabilities: this.compactUserCapabilities({
          roles: Array.isArray(payload.roles) ? payload.roles : undefined,
          additionalCapabilities: Array.isArray(payload.additionalCapabilities)
            ? payload.additionalCapabilities
            : undefined,
          deniedCapabilities: Array.isArray(payload.deniedCapabilities)
            ? payload.deniedCapabilities
            : undefined,
        }),
      };

      session.set('user', user);
      return user;
    } catch (e: unknown) {
      // Invalid signature/claims; ignore and continue with fallback auth paths.
      this.logger.warn(
        `Failed to verify JWT from Authorization header: ${e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private compactUserCapabilities(
    input: unknown,
  ): UserCapabilities | undefined {
    if (!input || typeof input !== 'object') return undefined;

    const raw = input as {
      roles?: string[] | unknown;
      additionalCapabilities?: Array<Capability | CapabilityString | unknown>;
      deniedCapabilities?: Array<Capability | CapabilityString | unknown>;
    };

    const roles = Array.isArray(raw.roles)
      ? raw.roles.filter((r): r is string => typeof r === 'string')
      : [];

    const additionalCapabilities = this.toCompactCapabilitiesArray(
      raw.additionalCapabilities,
    );
    const deniedCapabilities = this.toCompactCapabilitiesArray(
      raw.deniedCapabilities,
    );

    if (roles.length === 0 && !additionalCapabilities && !deniedCapabilities) {
      return undefined;
    }

    return {
      roles,
      additionalCapabilities,
      deniedCapabilities,
    };
  }

  private toCompactCapabilitiesArray(
    input: unknown,
  ): CapabilityString[] | undefined {
    if (!Array.isArray(input)) return undefined;

    const compact = input
      .map((cap) => {
        if (typeof cap === 'string') return cap;
        if (cap && typeof cap === 'object') {
          return serializeCapability(cap as Capability);
        }
        return undefined;
      })
      .filter((cap): cap is string => typeof cap === 'string');

    return compact.length > 0 ? compact : undefined;
  }

  private async getJwtVerificationKey() {
    const publicKey = process.env.JWT_PUBLIC_KEY;
    if (publicKey) {
      const normalizedKey = publicKey.includes('BEGIN PUBLIC KEY')
        ? publicKey
        : publicKey.replace(/\\n/g, '\n');
      try {
        return await importSPKI(
          normalizedKey,
          process.env.JWT_PUBLIC_KEY_ALG ?? 'RS256',
        );
      } catch (_e: unknown) {
        this.logger.warn(
          'JWT_PUBLIC_KEY is set but not a valid SPKI key; falling back to JWT_SECRET if available.',
        );
      }
    }

    const secret = process.env.JWT_SECRET ?? process.env.AUTH_JWT_SECRET;
    if (secret) return this.encoder.encode(secret);

    return undefined;
  }
}
