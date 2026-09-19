/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
import type { Client, EvaluationContext } from '@openfeature/server-sdk';
import {
  FEATURE_FLAGS_CLIENT,
  FEATURE_FLAGS_DEFAULT_CONTEXT,
  FEATURE_FLAGS_DEFAULT_OPTIONS,
  FEATURE_FLAGS_TARGETING_KEY_FACTORY,
} from './constants/tokens';
import { FeatureDisabledError } from './errors/feature-disabled.error';
import { FeatureFlagEvaluationError } from './errors/feature-flag-evaluation.error';
import { buildEvaluationContext } from './helpers/evaluation-context';
import type {
  FeatureFlagBehaviorOptions,
  FeatureFlagDecision,
  TargetingKeyFactory,
} from './interfaces/feature-flags-options.interface';

/**
 * Unique symbol key set on `context.items` recording the final boolean gate
 * decision (`true` means the handler was allowed to execute).
 *
 * Kept for backward compatibility with the original package API. For richer
 * provider details use {@link FEATURE_FLAG_DECISION_ITEM}.
 *
 * @example
 * ```ts
 * const isEnabled = context.items.get(FEATURE_FLAG_ITEM) === true;
 * ```
 */
export const FEATURE_FLAG_ITEM = Symbol('FEATURE_FLAG_ITEM');

/**
 * Unique symbol key set on `context.items` recording the evaluated feature flag
 * key string.
 *
 * @example
 * ```ts
 * const flagKey = context.items.get(FEATURE_FLAG_KEY_ITEM) as string | undefined;
 * ```
 */
export const FEATURE_FLAG_KEY_ITEM = Symbol('FEATURE_FLAG_KEY_ITEM');

/**
 * Unique symbol key set on `context.items` with the full
 * {@link FeatureFlagDecision}: raw boolean value, final enabled decision,
 * provider variant/reason/error metadata, and targeting key when available.
 *
 * This lets audit/logging/telemetry behaviors inspect the exact decision without
 * evaluating the flag a second time.
 *
 * @example
 * ```ts
 * const decision = context.items.get(FEATURE_FLAG_DECISION_ITEM) as
 *   | FeatureFlagDecision
 *   | undefined;
 *
 * if (decision?.variant === 'treatment-a') {
 *   // enrich telemetry/audit metadata
 * }
 * ```
 */
export const FEATURE_FLAG_DECISION_ITEM = Symbol('FEATURE_FLAG_DECISION_ITEM');

/** Minimal OpenFeature boolean detail shape used by the behavior. */
interface BooleanEvaluationDetails {
  value: boolean;
  variant?: string;
  reason?: string;
  errorCode?: unknown;
  errorMessage?: string;
}

/**
 * Pipeline behavior that gates a handler behind an OpenFeature boolean flag.
 *
 * Provider-agnostic by design: it talks only to the OpenFeature {@link Client},
 * so the backing provider (Unleash, Flagsmith, LaunchDarkly, a local file, …) is
 * a drop-in swap configured once in {@link FeatureFlagsModule.forRoot}.
 * OpenFeature remains the feature-flag abstraction; this behavior adds only the
 * pipeline-specific semantics that an application repeatedly needs.
 *
 * Resolution of the effective options for a handler:
 * 1. Application-wide defaults bound to {@link FEATURE_FLAGS_DEFAULT_OPTIONS}
 *    (via {@link FeatureFlagsModule.forRoot}).
 * 2. Per-handler options from `@UsePipeline([FeatureFlagBehavior, { ... }])`,
 *    shallow-merged on top of the defaults (handler keys win).
 *
 * Behavior:
 * - No `flag` configured → transparent pass-through.
 * - Flag evaluates `true` and optional `allowedVariants` accepts the provider
 *   variant → run the handler.
 * - Final gate disabled → return `fallback(context)` when provided, otherwise
 *   throw {@link FeatureDisabledError}.
 * - Provider evaluation error → use the configured `defaultValue` by default,
 *   or throw {@link FeatureFlagEvaluationError} with `errorPolicy: 'throw'`.
 *
 * ### Stable rollout identity
 *
 * Percentage/gradual rollouts should use a stable user/account/device/tenant
 * identity through `targetingKeyFactory`. Correlation IDs are intentionally not
 * used automatically because they normally change on every request; using one
 * as the OpenFeature targeting key makes the same user jump between rollout
 * cohorts.
 *
 * @example Simple gate
 * ```ts
 * @CommandHandler(NewCheckoutCommand)
 * @UsePipeline([FeatureFlagBehavior, { flag: 'new-checkout' }])
 * export class NewCheckoutHandler {}
 * ```
 *
 * @example Sticky user rollout with graceful fallback
 * ```ts
 * @QueryHandler(GetRecommendationsQuery)
 * @UsePipeline([FeatureFlagBehavior, {
 *   flag: 'recommendations-v2',
 *   targetingKeyFactory: (ctx) =>
 *     ctx.items.get('currentUserId') as string | undefined,
 *   fallback: () => [],
 * }])
 * export class GetRecommendationsHandler {}
 * ```
 *
 * @example Run only for one experiment variant
 * ```ts
 * @UsePipeline([FeatureFlagBehavior, {
 *   flag: 'checkout-experiment',
 *   allowedVariants: ['treatment-a'],
 * }])
 * ```
 *
 * @example Make flag-provider failure visible instead of using the default
 * ```ts
 * @UsePipeline([FeatureFlagBehavior, {
 *   flag: 'critical-kill-switch',
 *   errorPolicy: 'throw',
 * }])
 * ```
 */
@Injectable()
export class FeatureFlagBehavior implements IPipelineBehavior {
  private readonly logger: LoggerService;
  private readonly defaults: FeatureFlagBehaviorOptions;

  constructor(
    @Inject(FEATURE_FLAGS_CLIENT)
    private readonly client: Client,
    @Optional()
    @Inject(FEATURE_FLAGS_DEFAULT_OPTIONS)
    defaults?: FeatureFlagBehaviorOptions,
    @Optional()
    @Inject(FEATURE_FLAGS_DEFAULT_CONTEXT)
    private readonly moduleContext?: EvaluationContext,
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    logger?: LoggerService,
    @Optional()
    @Inject(FEATURE_FLAGS_TARGETING_KEY_FACTORY)
    private readonly moduleTargetingKeyFactory?: TargetingKeyFactory,
  ) {
    this.defaults = defaults ?? {};
    this.logger =
      logger ?? new Logger(FeatureFlagBehavior.name, { timestamp: true });
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options = this.resolveOptions(context);

    // No flag to gate on — behave as a transparent pass-through.
    if (!options.flag) return next();

    const targetingKeyFactory =
      options.targetingKeyFactory ?? this.moduleTargetingKeyFactory;
    const evaluationContext = buildEvaluationContext(
      context,
      this.moduleContext,
      options.context,
      targetingKeyFactory,
    );
    const defaultValue = options.defaultValue ?? false;

    const { details, failure } = await this.evaluate(
      options.flag,
      defaultValue,
      evaluationContext,
    );

    // A boolean true is necessary but, when allowedVariants is configured, not
    // sufficient: the provider must also resolve one of the selected variants.
    const variantAllowed =
      !options.allowedVariants?.length ||
      (!!details.variant && options.allowedVariants.includes(details.variant));
    const enabled = details.value && variantAllowed;

    const decision: FeatureFlagDecision = {
      flagKey: options.flag,
      value: details.value,
      enabled,
      ...(details.variant ? { variant: details.variant } : {}),
      ...(details.reason ? { reason: details.reason } : {}),
      ...(details.errorCode !== undefined
        ? { errorCode: String(details.errorCode) }
        : {}),
      ...(details.errorMessage ? { errorMessage: details.errorMessage } : {}),
      ...(evaluationContext.targetingKey
        ? { targetingKey: evaluationContext.targetingKey }
        : {}),
    };

    // Published before the error policy is applied. With errorPolicy: 'throw'
    // the evaluation used to throw from inside evaluate(), so the decision item
    // was never written — leaving an outer audit or telemetry behavior blind in
    // exactly the case it most needs to record.
    context.items.set(FEATURE_FLAG_KEY_ITEM, options.flag);
    context.items.set(FEATURE_FLAG_ITEM, enabled);
    context.items.set(FEATURE_FLAG_DECISION_ITEM, decision);

    if (failure && (options.errorPolicy ?? 'use-default') === 'throw') {
      throw new FeatureFlagEvaluationError(
        options.flag,
        context.requestName,
        failure.errorCode,
        failure.message,
        { cause: failure.cause },
      );
    }

    const variantSuffix = details.variant ? ` variant=${details.variant}` : '';
    const reasonSuffix = details.reason ? ` reason=${details.reason}` : '';

    if (enabled) {
      this.logger.debug?.(
        `Feature "${options.flag}" enabled for ${context.requestName}${variantSuffix}${reasonSuffix}`,
        FeatureFlagBehavior.name,
      );
      return next();
    }

    this.logger.debug?.(
      `Feature "${options.flag}" disabled for ${context.requestName}${variantSuffix}${reasonSuffix}`,
      FeatureFlagBehavior.name,
    );

    if (options.fallback) return options.fallback(context);
    throw new FeatureDisabledError(options.flag, context.requestName);
  }

  /**
   * Uses OpenFeature's detailed evaluation API so variant/reason/error metadata
   * is available to the pipeline.
   *
   * This never throws. A provider failure is normalized into usable details plus
   * a `failure` descriptor, so the caller can publish the decision record first
   * and apply the error policy afterwards. Throwing from here meant the most
   * operationally interesting outcome — evaluation failed — was the one case
   * that produced no inspectable record at all.
   */
  private async evaluate(
    flag: string,
    defaultValue: boolean,
    evaluationContext: EvaluationContext,
  ): Promise<{
    details: BooleanEvaluationDetails;
    failure?: { message: string; errorCode?: string; cause?: unknown };
  }> {
    let details: BooleanEvaluationDetails;

    try {
      details = (await this.client.getBooleanDetails(
        flag,
        defaultValue,
        evaluationContext,
      )) as BooleanEvaluationDetails;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        details: {
          value: defaultValue,
          reason: 'ERROR',
          errorMessage: message,
        },
        failure: { message, cause: error },
      };
    }

    // A provider that reports an error in its details rather than throwing is
    // the same outcome from the application's point of view.
    if (details.errorCode !== undefined) {
      return {
        details,
        failure: {
          message: details.errorMessage ?? String(details.errorCode),
          errorCode: String(details.errorCode),
        },
      };
    }

    return { details };
  }

  /** Shallow-merges per-handler options over the application defaults. */
  private resolveOptions(
    context: IPipelineContext,
  ): FeatureFlagBehaviorOptions {
    const handlerOptions =
      context.getBehaviorOptions<FeatureFlagBehaviorOptions>(
        FeatureFlagBehavior,
      );
    return handlerOptions
      ? { ...this.defaults, ...handlerOptions }
      : this.defaults;
  }
}
