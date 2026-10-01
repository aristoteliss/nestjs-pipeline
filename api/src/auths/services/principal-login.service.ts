/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type IQueryRepository,
  type IWriteSideAggregateRepository,
  requireTenant,
} from '@cqrs-ddd/core/application';
import { ConcurrencyConflictError } from '@cqrs-ddd/core/domain';
import { joinKeySegments } from '@cqrs-ddd/safe-stringify';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  RATE_LIMITER,
  RateLimitExceededError,
  type RateLimiterLike,
  type RateLimiterResLike,
} from '@nestjs-pipeline/rate-limit';
import { RATE_LIMIT_COST } from '../../common/constants/rate-limit.constants.js';
import { GetUserQuery } from '../../users/application/cqrs/queries/get-user.query.js';
import { User } from '../../users/domain/models/user.entity.js';
import { EXT_USER_QUERY_REPOSITORY } from '../../users/persistence/repository.tokens.js';
import { GetAuthByConsumedTokenHashQuery } from '../application/cqrs/queries/get-auth-by-consumed-token-hash.query.js';
import { GetAuthByTokenHashQuery } from '../application/cqrs/queries/get-auth-by-token-hash.query.js';
import { GetUserPermissionRulesQuery } from '../application/cqrs/queries/get-user-permission-rules.query.js';
import {
  ACCESS_TOKEN_ISSUER,
  type AccessTokenIssueResult,
  type IAccessTokenIssuer,
} from '../application/ports/access-token-issuer.port.js';
import {
  AUTH_TOKEN_POLICY,
  type AuthTokenPolicy,
} from '../application/ports/auth-token-policy.port.js';
import {
  type ILoginCodeVerifier,
  LOGIN_CODE_VERIFIER,
} from '../application/ports/login-code-verifier.port.js';
import {
  type IRefreshTokens,
  REFRESH_TOKENS,
} from '../application/ports/refresh-tokens.port.js';
import {
  type ISessionCookies,
  SESSION_COOKIES,
} from '../application/ports/session-cookies.port.js';
import type { AuthResult } from '../application/results/auth.result.js';
import { InvalidLoginCredentialsException } from '../domain/errors/authentication.exception.js';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from '../domain/errors/refresh-token.errors.js';
import type { Auth } from '../domain/models/auth.entity.js';
import { GetUserPermissionRulesRepository } from '../persistence/get-user-permission-rules.query-repository.js';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from '../persistence/repository.tokens.js';

function isRateLimiterRes(value: unknown): value is RateLimiterResLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RateLimiterResLike).msBeforeNext === 'number' &&
    typeof (value as RateLimiterResLike).remainingPoints === 'number'
  );
}

@Injectable()
export class PrincipalLoginService {
  constructor(
    @Inject(EXT_USER_QUERY_REPOSITORY.getUser)
    private readonly queryRepository: IQueryRepository<
      GetUserQuery,
      User | null
    >,
    @Inject(LOGIN_CODE_VERIFIER)
    private readonly loginCodeVerifier: ILoginCodeVerifier,
    @Inject(ACCESS_TOKEN_ISSUER)
    private readonly accessTokenIssuer: IAccessTokenIssuer,
    @Inject(AUTH_TOKEN_POLICY)
    private readonly policy: AuthTokenPolicy,
    private readonly permissionRules: GetUserPermissionRulesRepository,
    @Inject(QUERY_REPOSITORY.getAuthByTokenHash)
    private readonly authByTokenHash: IQueryRepository<
      GetAuthByTokenHashQuery,
      Auth | null
    >,
    @Inject(QUERY_REPOSITORY.getAuthByConsumedTokenHash)
    private readonly authByConsumedTokenHash: IQueryRepository<
      GetAuthByConsumedTokenHashQuery,
      Auth | null
    >,
    @Inject(COMMAND_REPOSITORY.updateAuth)
    private readonly authRepository: IWriteSideAggregateRepository<Auth>,
    @Inject(REFRESH_TOKENS)
    private readonly refreshTokens: IRefreshTokens,
    @Inject(SESSION_COOKIES)
    private readonly cookies: ISessionCookies,
    @Optional()
    @Inject(EventBus)
    private readonly eventBus?: EventBus,
    @Optional()
    @Inject(RATE_LIMITER)
    private readonly rateLimiter?: RateLimiterLike,
  ) {}

  /**
   * Finds the user by email in primary storage and verifies the login code
   * through `LOGIN_CODE_VERIFIER`.
   *
   * @param email - The claimed email.
   * @param code - The presented login code.
   * @returns The authenticated user.
   * @throws InvalidLoginCredentialsException for an unknown email and for a wrong
   *   code alike, so the answer does not reveal which accounts exist.
   *
   * @example
   * ```ts
   * const user = await this.principalLoginService.authenticate(command.email, command.code);
   * ```
   */
  async authenticate(email: string, code: string): Promise<User> {
    const user = await this.queryRepository.find(
      new GetUserQuery({ email }, { refresh: true }),
    );

    if (!user) {
      throw new InvalidLoginCredentialsException();
    }

    await this.loginCodeVerifier.verify({ userId: user.id, code });

    return user;
  }

  /**
   * Issues an access token for `user` bound to the `Auth` session `sessionId`.
   * When `embedPermissions` is on, it reads the user's rules first and
   * embeds them, so the token carries the rules as they are at issue time.
   *
   * @param user - The authenticated user.
   * @param sessionId - Id of the `Auth` session; the token carries it as `sid`.
   * @returns The token and its expiry as a Unix timestamp in milliseconds.
   *
   * @example
   * ```ts
   * await this.commandRepository.save(auth);
   * const access = await this.principalLoginService.sign(user, auth.id);
   * ```
   */
  async sign(user: User, sessionId: string): Promise<AccessTokenIssueResult> {
    return this.accessTokenIssuer.issue({
      user,
      sessionId,
      ...(this.policy.embedPermissions
        ? {
            permissions: await this.permissionRules.find(
              new GetUserPermissionRulesQuery(
                { userId: user.id },
                { refresh: true },
              ),
            ),
          }
        : {}),
    });
  }

  /**
   * Exchanges a valid refresh token for a refreshed session and access token.
   *
   * Validates the presented token against active sessions and consumed history,
   * enforcing single-use rotation, reuse detection (revoking compromised sessions),
   * and reuse grace windows. On successful rotation, persists the updated session,
   * stores new session cookies, and publishes domain events.
   *
   * @param refreshToken - The plain-text refresh token presented by the caller.
   * @param clientIp - Optional client IP address for partitioned rate limiting.
   * @returns The refreshed authentication result including the access token and session metadata.
   * @throws {RateLimitExceededError} When the per-IP refresh rate limit is exceeded.
   * @throws {InvalidRefreshTokenError} When the token is unknown, expired, or belongs to a missing user.
   * @throws {RefreshTokenReuseError} When an already consumed token is reused outside the grace window.
   *
   * @example
   * ```ts
   * const result = await this.principalLoginService.refresh(refreshToken, clientIp);
   * ```
   */
  async refresh(refreshToken: string, clientIp?: string): Promise<AuthResult> {
    if (this.rateLimiter && clientIp) {
      const key = joinKeySegments([
        requireTenant('the refresh rate limit'),
        clientIp.trim(),
        'refresh',
      ]);
      try {
        await this.rateLimiter.consume(key, RATE_LIMIT_COST.refresh);
      } catch (error) {
        if (isRateLimiterRes(error)) {
          throw new RateLimitExceededError({
            key,
            requestName: 'refresh',
            msBeforeNext: error.msBeforeNext,
            remainingPoints: error.remainingPoints,
            limit: this.rateLimiter.points,
            points: RATE_LIMIT_COST.refresh,
          });
        }
        throw error;
      }
    }

    const presented = this.refreshTokens.hash(refreshToken);
    const now = Date.now();

    let auth = await this.authByTokenHash.find(
      new GetAuthByTokenHashQuery({ tokenHash: presented }),
    );
    if (!auth) {
      const reused = await this.authByConsumedTokenHash.find(
        new GetAuthByConsumedTokenHashQuery({ tokenHash: presented }),
      );
      if (!reused) throw new InvalidRefreshTokenError();
      await this.revoke(reused, now);
      throw new RefreshTokenReuseError();
    }

    const nextToken = this.refreshTokens.generate();
    const nextHash = this.refreshTokens.hash(nextToken);
    const graceMs = this.policy.refreshReuseGraceSeconds * 1000;

    for (let attempt = 0; ; attempt++) {
      try {
        const outcome = auth.refresh(presented, nextHash, Date.now(), graceMs);
        const user = await this.queryRepository.find(
          new GetUserQuery({ userId: auth.userId }, { refresh: true }),
        );
        if (!user) throw new InvalidRefreshTokenError();
        const access = await this.sign(user, auth.id);
        const preparedAt = Date.now();
        if (preparedAt >= auth.expiresAt) throw new InvalidRefreshTokenError();
        if (outcome === 'grace') {
          auth.refresh(presented, nextHash, preparedAt, graceMs);
        } else {
          await this.authRepository.save(auth);
        }

        const result: AuthResult = {
          aggregate: auth,
          userId: user.id,
          principalType: 'user',
          tenant: requireTenant('refresh'),
          email: user.email,
          department: user.department,
          accessToken: access.accessToken,
          accessTokenExpiresAt: access.expiresAt,
          ...(outcome === 'rotated' ? { refreshToken: nextToken } : {}),
          sessionExpiresAt: auth.expiresAt,
        };
        this.cookies.save(result);

        const events = [...auth.getUncommittedEvents()];
        if (events.length > 0) {
          const published = this.eventBus?.publishAll(events, auth);
          auth.uncommit();
          await published;
        }

        return result;
      } catch (error) {
        if (error instanceof RefreshTokenReuseError) {
          await this.revoke(auth, Date.now());
          throw error;
        }
        if (!(error instanceof ConcurrencyConflictError) || attempt === 1)
          throw error;
        const reloaded = await this.authRepository.findById(auth.id);
        if (!reloaded) throw new InvalidRefreshTokenError();
        auth = reloaded;
        if (
          presented !== auth.refreshTokenHash &&
          presented !== auth.previousRefreshTokenHash
        ) {
          await this.revoke(auth, Date.now());
          throw new RefreshTokenReuseError();
        }
      }
    }
  }

  /**
   * Persists the revocation of `auth`, reloading it and trying again when a
   * concurrent write wins the version check, for at most three attempts. A
   * session whose revocation is already saved is returned without a write, and
   * the first revocation time is kept.
   *
   * @param auth - The login session to revoke. It may already carry an unsaved
   *   revocation that `Auth.refresh` recorded on token reuse.
   * @param now - Revocation time as a Unix timestamp in milliseconds.
   * @returns The revoked session, or `null` when it was deleted concurrently.
   * @throws ConcurrencyConflictError when all three attempts lose the version check.
   *
   * @example
   * ```ts
   * const revoked = await this.principalLoginService.revoke(auth, Date.now());
   * if (!revoked) throw new InvalidRefreshTokenError();
   * ```
   */
  async revoke(auth: Auth, now: number): Promise<Auth | null> {
    const maxAttempts = 3;
    let current: Auth | null = auth;

    for (let attempt = 0; ; attempt++) {
      if (
        current.revokedAt !== null &&
        current.version === current.getExpectedVersion()
      ) {
        return current;
      }
      current.revoke(now);
      try {
        await this.authRepository.save(current);
        return current;
      } catch (error) {
        if (
          !(error instanceof ConcurrencyConflictError) ||
          attempt === maxAttempts - 1
        )
          throw error;
        current = await this.authRepository.findById(auth.id);
        if (!current) {
          return current;
        }
      }
    }
  }
}
