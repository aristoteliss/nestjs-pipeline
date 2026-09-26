/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type {
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
} from '@nestjs/common';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import type { RateLimiterLike } from './rate-limiter.interface';

/**
 * Derives the rate-limit bucket key from the pipeline context — e.g. combine
 * `context.requestName` with a tenant or user id to limit per caller.
 */
export type RateLimitKeyFactory = (context: IPipelineContext) => string;

/**
 * Computes the points a request costs from the pipeline context — e.g. one
 * point per item of a bulk command. Must return a non-negative safe integer.
 */
export type RateLimitCostFactory = (context: IPipelineContext) => number;

/**
 * Per-handler (and module-default) options for {@link RateLimitBehavior}.
 *
 * @example Tenant + caller scoped limit
 * ```ts
 * const perUser = createPartitionedRateLimitKeyFactory(
 *   (ctx) => ctx.items.get('userId') as string | undefined,
 * );
 *
 * @UsePipeline([RateLimitBehavior, {
 *   keyFactory: perUser,
 *   points: 1,
 * }])
 * export class CreateOrderHandler {}
 * ```
 */
export interface RateLimitBehaviorOptions {
  /**
   * Points this request costs: a non-negative safe integer, or a
   * {@link RateLimitCostFactory} computing it per request. `0` charges
   * nothing: the limiter is not called and no key is built. Default `1`.
   *
   * @example One point per imported row
   * ```ts
   * points: (ctx) => (ctx.request as ImportUsersCommand).rows.length
   * ```
   */
  points?: number | RateLimitCostFactory;
  /**
   * Builds the bucket key. Required whenever the behavior executes; there is
   * no implicit shared bucket. Prefer `createPartitionedRateLimitKeyFactory`
   * for tenant/caller-aware limits.
   */
  keyFactory?: RateLimitKeyFactory;
  /** Optional prefix prepended to the key as `"<prefix>:<key>"`. */
  keyPrefix?: string;
  /**
   * Per-handler limiter override — use a stricter/looser limiter for specific
   * handlers without changing the global one. Defaults to the injected limiter.
   */
  limiter?: RateLimiterLike;
  /**
   * When the backing store itself errors (e.g. Redis is unreachable — distinct
   * from a normal limit hit), allow the request through (`true`, default) or
   * reject it (`false`). Fail-open favors availability; fail-closed favors
   * strict protection.
   */
  failOpen?: boolean;
}

/**
 * Options for {@link RateLimitModule.forRoot}.
 *
 * @example Single-process limiter with handler-specific keys
 * ```ts
 * RateLimitModule.forRoot({
 *   limiter: new RateLimiterMemory({ points: 20, duration: 60 }),
 *   defaults: { failOpen: true },
 * });
 * ```
 */
export interface RateLimitModuleOptions {
  /** The limiter instance every handler shares by default. */
  limiter: RateLimiterLike;
  /** Module-wide defaults, overridable per handler. */
  defaults?: RateLimitBehaviorOptions;
}

/**
 * Options for {@link RateLimitModule.forRootAsync}.
 *
 * @example Build a distributed limiter from an injected Redis client
 * ```ts
 * RateLimitModule.forRootAsync({
 *   inject: [REDIS],
 *   useFactory: (redis) =>
 *     new RateLimiterRedis({ storeClient: redis, points: 100, duration: 60 }),
 * });
 * ```
 */
export interface RateLimitModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /** Factory that builds the limiter from injected dependencies. */
  useFactory: (...args: never[]) => RateLimiterLike | Promise<RateLimiterLike>;
  /** Providers injected into {@link useFactory}. */
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  /** Module-wide defaults, overridable per handler. */
  defaults?: RateLimitBehaviorOptions;
}
