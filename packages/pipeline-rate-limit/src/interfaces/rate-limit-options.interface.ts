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

/** Per-handler (and module-default) options for {@link RateLimitBehavior}. */
export interface RateLimitBehaviorOptions {
  /** Positive safe-integer points this request costs. Default `1`. */
  points?: number;
  /**
   * Builds the bucket key. Default: `context.requestName` (one bucket per
   * request type). Combine with a user/tenant id for per-caller limits.
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

/** Options for {@link RateLimitModule.forRoot}. */
export interface RateLimitModuleOptions {
  /** The limiter instance every handler shares by default. */
  limiter: RateLimiterLike;
  /** Module-wide defaults, overridable per handler. */
  defaults?: RateLimitBehaviorOptions;
}

/** Options for {@link RateLimitModule.forRootAsync}. */
export interface RateLimitModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /** Factory that builds the limiter from injected dependencies. */
  useFactory: (...args: never[]) => RateLimiterLike | Promise<RateLimiterLike>;
  /** Providers injected into {@link useFactory}. */
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  /** Module-wide defaults, overridable per handler. */
  defaults?: RateLimitBehaviorOptions;
}
