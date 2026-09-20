/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
  type IPipelineBehaviorContract,
  type IPipelineContext,
  LOGGING_BEHAVIOR_LOGGER,
  type NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineBehaviorDiagnostic,
  type PipelineBehaviorValidationContext,
} from '@nestjs-pipeline/core';
import { RESILIENCE_DEFAULT_OPTIONS } from './constants/tokens';
import { ResilienceConfigurationError } from './errors/resilience-configuration.error';
import {
  type AnyPolicy,
  buildResiliencePolicy,
} from './helpers/policy-factory';
import {
  runWithResilienceAbortSignal,
  runWithResilienceRequest,
} from './helpers/resilience-context';
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
 *
 * ### Replay / error-classification safety
 *
 * A handler-level retry calls `next()` again, which means the complete
 * downstream pipeline and handler are replayed. To avoid accidental duplicate
 * side effects, command/event retries must explicitly set
 * `retry.replaySafe: true`. Retry/circuit-breaker/fallback configurations must
 * also define which errors are transient via `handle(error)`, unless the caller
 * intentionally opts into `handleAllErrors: true`.
 *
 * Timeout and bulkhead-only policies do not require an error classifier because
 * they do not decide which application errors are retryable/circuit failures.
 * A custom pre-built Cockatiel `policy` also bypasses the declarative safety
 * checks because the caller owns its semantics directly.
 */
interface ResilienceSafetyIssue {
  message: string;
  fix: string;
}

function getResilienceSafetyIssues(
  options: ResilienceBehaviorOptions | undefined,
  requestKind: 'command' | 'query' | 'event' | 'unknown',
): ResilienceSafetyIssue[] {
  if (!options || options.policy) return [];

  const issues: ResilienceSafetyIssue[] = [];
  const classifiesErrors =
    typeof options.handle === 'function' || options.handleAllErrors === true;
  const needsErrorClassification =
    !!options.retry || !!options.circuitBreaker || !!options.fallback;

  if (needsErrorClassification && !classifiesErrors) {
    issues.push({
      message:
        'retry, circuitBreaker and fallback require handle(error) or explicit handleAllErrors: true',
      fix: 'Specify handle: (err) => boolean or handleAllErrors: true in ResilienceBehavior options.',
    });
  }

  if (
    options.retry &&
    requestKind !== 'query' &&
    options.retry.replaySafe !== true
  ) {
    issues.push({
      message: `retry on non-query handler (${requestKind}) replays downstream work; commands/events must set retry.replaySafe: true`,
      fix: 'Set retry: { ...retry, replaySafe: true } after verifying handler side effects are idempotent or transactional.',
    });
  }

  return issues;
}

@Injectable()
export class ResilienceBehavior implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    validate: (
      context: PipelineBehaviorValidationContext,
    ): PipelineBehaviorDiagnostic[] | undefined => {
      const options = context.effectiveOptions as
        | ResilienceBehaviorOptions
        | undefined;
      const issues = getResilienceSafetyIssues(options, context.requestKind);
      if (issues.length === 0) return undefined;

      return issues.map((issue) => ({
        handlerName: context.handlerName,
        behaviorName: ResilienceBehavior.name,
        message: issue.message,
        fix: issue.fix,
      }));
    },
  };

  private readonly logger: LoggerService;
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
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const policy = this.resolvePolicy(context);
    if (!policy) return next();

    // The policy is shared across every request that reaches this handler, so
    // the request's own labels travel with the execution rather than being
    // captured when the policy was built.
    return runWithResilienceRequest(
      { requestName: context.requestName, handlerName: context.handlerName },
      () =>
        policy.execute((policyContext) => {
          // Cockatiel supplies the effective AbortSignal (including timeout
          // cancellation) to each execute callback. Bind it to this attempt's
          // async execution so an aggressive timeout followed by a retry cannot
          // replace the signal still observed by work from the timed-out attempt.
          return runWithResilienceAbortSignal(policyContext.signal, next);
        }),
    );
  }

  /** Resolves, validates, and caches the composed policy for the handler in `context`. */
  private resolvePolicy(context: IPipelineContext): AnyPolicy | null {
    const cached = this.policyCache.get(context.handlerType);
    if (cached !== undefined) return cached;

    const handlerOptions =
      context.getBehaviorOptions<ResilienceBehaviorOptions>(ResilienceBehavior);
    const effective = this.resolveEffectiveOptions(handlerOptions);

    this.assertSafeConfiguration(context, effective);

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

  /**
   * Rejects ambiguous whole-handler resilience configurations before Cockatiel
   * policy creation. This turns replay/error-classification assumptions into an
   * explicit application decision instead of a hidden default.
   */
  private assertSafeConfiguration(
    context: IPipelineContext,
    options: ResilienceBehaviorOptions | undefined,
  ): void {
    const issues = getResilienceSafetyIssues(options, context.requestKind);
    if (issues.length > 0) {
      throw new ResilienceConfigurationError(
        context.requestName,
        context.requestKind,
        issues[0].message,
      );
    }
  }

  /** Shallow-merges pipeline-level options over module defaults. */
  resolveEffectiveOptions(
    options?: ResilienceBehaviorOptions,
  ): ResilienceBehaviorOptions | undefined {
    return this.mergeOptions(this.defaultOptions, options);
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
