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

import {
  Inject,
  Injectable,
  Logger,
  type LoggerService,
  Optional,
} from '@nestjs/common';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  LOGGING_BEHAVIOR_LOGGER,
  type NextDelegate,
} from '@nestjs-pipeline/core';
import { RATE_LIMIT_DEFAULT_OPTIONS, RATE_LIMITER } from './constants/tokens';
import { RateLimitExceededError } from './errors/rate-limit-exceeded.error';
import { buildRateLimitKey } from './helpers/build-key';
import type { RateLimitBehaviorOptions } from './interfaces/rate-limit-options.interface';
import type {
  RateLimiterLike,
  RateLimiterResLike,
} from './interfaces/rate-limiter.interface';

/** Item key set on the pipeline context with the result of a rate-limit check. */
export const RATE_LIMIT_ITEM = 'rate-limit.result';
/** Item key set on the pipeline context with the resolved bucket key. */
export const RATE_LIMIT_KEY_ITEM = 'rate-limit.key';

/** Whether a rejection value is a `rate-limiter-flexible` result (a limit hit). */
function isRateLimiterRes(value: unknown): value is RateLimiterResLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RateLimiterResLike).msBeforeNext === 'number' &&
    typeof (value as RateLimiterResLike).remainingPoints === 'number'
  );
}

/**
 * Pipeline behavior that enforces rate limits before a handler runs.
 *
 * For each request it consumes `points` (default `1`) from a bucket keyed by
 * {@link buildRateLimitKey}. If the bucket is exhausted it throws
 * {@link RateLimitExceededError} (map to HTTP 429 with
 * {@link RateLimitExceededFilter}); otherwise the handler proceeds.
 *
 * Backend-agnostic: it depends only on {@link RateLimiterLike}, so any
 * `rate-limiter-flexible` backend (memory, Redis/Valkey, Mongo, SQL) is a
 * one-line swap in {@link RateLimitModule.forRoot}.
 *
 * @example Per-handler limit, keyed by caller
 * ```ts
 * @CommandHandler(CreateUserCommand)
 * @UsePipeline([
 *   RateLimitBehavior,
 *   { points: 1, keyFactory: (ctx) => `${ctx.requestName}:${ctx.request.ip}` },
 * ])
 * export class CreateUserHandler {}
 * ```
 */
@Injectable()
export class RateLimitBehavior implements IPipelineBehavior {
  private readonly logger: LoggerService;
  private readonly defaults: RateLimitBehaviorOptions;

  constructor(
    @Inject(RATE_LIMITER)
    private readonly limiter: RateLimiterLike,
    @Optional()
    @Inject(RATE_LIMIT_DEFAULT_OPTIONS)
    defaults?: RateLimitBehaviorOptions,
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    logger?: LoggerService,
  ) {
    this.defaults = defaults ?? {};

    if (!logger) {
      this.logger = new Logger(RateLimitBehavior.name, { timestamp: true });
      return;
    }

    this.logger = logger;
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options = this.resolveOptions(context);
    const limiter = options.limiter ?? this.limiter;
    const key = buildRateLimitKey(context, options);
    const points = options.points ?? 1;

    context.items.set(RATE_LIMIT_KEY_ITEM, key);

    let result: RateLimiterResLike;
    try {
      result = await limiter.consume(key, points);
    } catch (error) {
      if (isRateLimiterRes(error)) {
        context.items.set(RATE_LIMIT_ITEM, error);
        throw new RateLimitExceededError({
          key,
          requestName: context.requestName,
          msBeforeNext: error.msBeforeNext,
          remainingPoints: error.remainingPoints,
          limit: limiter.points,
        });
      }
      return this.handleStoreError(context, options, key, error, next);
    }

    context.items.set(RATE_LIMIT_ITEM, result);
    return next();
  }

  /** Fail-open (default) or fail-closed when the backing store itself errors. */
  private handleStoreError(
    context: IPipelineContext,
    options: RateLimitBehaviorOptions,
    key: string,
    error: unknown,
    next: NextDelegate,
  ): Promise<unknown> {
    const message = error instanceof Error ? error.message : String(error);

    if (options.failOpen ?? true) {
      this.logger.warn?.(
        `Rate limiter store error for ${context.requestName} ` +
          `(key: ${key}); failing open: ${message}`,
        RateLimitBehavior.name,
      );
      return next();
    }

    this.logger.error?.(
      `Rate limiter store error for ${context.requestName} ` +
        `(key: ${key}); failing closed: ${message}`,
      RateLimitBehavior.name,
    );
    throw error;
  }

  /** Shallow-merges per-handler options over the module defaults. */
  private resolveOptions(context: IPipelineContext): RateLimitBehaviorOptions {
    const handlerOptions =
      context.getBehaviorOptions<RateLimitBehaviorOptions>(RateLimitBehavior);
    if (!handlerOptions) return this.defaults;
    return { ...this.defaults, ...handlerOptions };
  }
}
