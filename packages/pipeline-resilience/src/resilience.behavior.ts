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
  type Type,
} from '@nestjs/common';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  LOGGING_BEHAVIOR_LOGGER,
  type NextDelegate,
  untyped,
} from '@nestjs-pipeline/core';
import { RESILIENCE_DEFAULT_OPTIONS } from './constants/tokens';
import {
  type AnyPolicy,
  buildResiliencePolicy,
} from './helpers/policy-factory';
import type { ResilienceBehaviorOptions } from './interfaces/resilience-options.interface';

/**
 * Pipeline behavior that wraps each command / query / event handler in a
 * cockatiel resilience policy (retry, circuit breaker, timeout, bulkhead,
 * fallback) for transient-fault handling.
 *
 * Resolution of the effective options for a handler where this behavior is
 * attached:
 * 1. Application-wide defaults bound to {@link RESILIENCE_DEFAULT_OPTIONS}
 *    (via {@link ResilienceModule.forRoot}).
 * 2. Per-handler options from `@UsePipeline([ResilienceBehavior, { ... }])`,
 *    shallow-merged on top of the defaults (handler keys win).
 *
 * Policies are built **lazily on first invocation and cached per handler**, so
 * stateful layers (circuit breaker, bulkhead) correctly share state across
 * every request to that handler. When no options resolve, the behavior caches
 * that result and passes subsequent invocations directly to `next()` without
 * constructing or executing a cockatiel policy.
 */
@Injectable()
export class ResilienceBehavior implements IPipelineBehavior {
  private readonly logger: LoggerService;
  private readonly logContext: string | undefined;
  /**
   * Per-handler policy cache. `null` means "resolved, but nothing configured"
   * (pass-through), distinct from `undefined` ("not yet resolved").
   */
  private readonly policyCache = new Map<Type, AnyPolicy | null>();

  constructor(
    @Optional()
    @Inject(RESILIENCE_DEFAULT_OPTIONS)
    private readonly defaultOptions?: ResilienceBehaviorOptions,
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    logger?: LoggerService,
  ) {
    if (!logger) {
      this.logger = new Logger(ResilienceBehavior.name, { timestamp: true });
      return;
    }

    this.logger = logger;
    this.logContext = ResilienceBehavior.name;
    if (typeof untyped(this.logger).setContext === 'function') {
      (
        this.logger as LoggerService & { setContext(context: string): void }
      ).setContext(this.logContext);
    }
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const policy = this.resolvePolicy(context);
    if (!policy) return next();
    return policy.execute(() => next());
  }

  /** Resolves (and caches) the composed policy for the handler in `context`. */
  private resolvePolicy(context: IPipelineContext): AnyPolicy | null {
    const cached = this.policyCache.get(context.handlerType);
    if (cached !== undefined) return cached;

    const handlerOptions =
      context.getBehaviorOptions<ResilienceBehaviorOptions>(ResilienceBehavior);
    const effective = this.mergeOptions(this.defaultOptions, handlerOptions);

    const policy = effective
      ? buildResiliencePolicy(effective, {
          logger: this.logger,
          requestName: context.requestName,
          handlerName: context.handlerName,
        })
      : null;

    this.policyCache.set(context.handlerType, policy);
    return policy;
  }

  /** Shallow-merges per-handler options over the application defaults. */
  private mergeOptions(
    defaults: ResilienceBehaviorOptions | undefined,
    handler: ResilienceBehaviorOptions | undefined,
  ): ResilienceBehaviorOptions | undefined {
    if (!defaults && !handler) return undefined;
    return { ...(defaults ?? {}), ...(handler ?? {}) };
  }
}