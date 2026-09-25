/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  Inject,
  Injectable,
  Logger,
  type LoggerService,
  Optional,
} from '@nestjs/common';
import {
  createPipelineItem,
  type IPipelineBehavior,
  type IPipelineBehaviorContract,
  type IPipelineBehaviorOptionsResolver,
  type IPipelineContext,
  LOGGING_BEHAVIOR_LOGGER,
  type NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineBehaviorDiagnostic,
  type PipelineBehaviorValidationContext,
  type PipelineItemToken,
  setPipelineItem,
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
 * Use this when only the final gate result is needed. For provider variant,
 * reason, error metadata, and targeting identity use
 * {@link FEATURE_FLAG_DECISION_ITEM}.
 *
 * @example
 * ```ts
 * const isEnabled = context.items.get(FEATURE_FLAG_ITEM) === true;
 * ```
 */
export const FEATURE_FLAG_ITEM = Symbol('FEATURE_FLAG_ITEM');

/**
 * Typed token for {@link FEATURE_FLAG_ITEM}: the feature flag gate decision. Reads and writes the same
 * `context.items` entry through `getPipelineItem` / `requirePipelineItem`.
 */
export const FEATURE_FLAG_ITEM_TOKEN: PipelineItemToken<boolean> =
  createPipelineItem<boolean>('FEATURE_FLAG_ITEM', FEATURE_FLAG_ITEM);

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
 * Typed token for {@link FEATURE_FLAG_KEY_ITEM}: the evaluated feature flag key. Reads and writes the same
 * `context.items` entry through `getPipelineItem` / `requirePipelineItem`.
 */
export const FEATURE_FLAG_KEY_ITEM_TOKEN: PipelineItemToken<string> =
  createPipelineItem<string>('FEATURE_FLAG_KEY_ITEM', FEATURE_FLAG_KEY_ITEM);

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

/**
 * Typed token for {@link FEATURE_FLAG_DECISION_ITEM}: the feature flag decision. Reads and writes the same
 * `context.items` entry through `getPipelineItem` / `requirePipelineItem`.
 */
export const FEATURE_FLAG_DECISION_ITEM_TOKEN: PipelineItemToken<FeatureFlagDecision> =
  createPipelineItem<FeatureFlagDecision>(
    'FEATURE_FLAG_DECISION_ITEM',
    FEATURE_FLAG_DECISION_ITEM,
  );

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
 * identity through `targetingKeyFactory`.
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
export class FeatureFlagBehavior
  implements
    IPipelineBehavior,
    IPipelineBehaviorOptionsResolver<FeatureFlagBehaviorOptions>
{
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    validate: (
      context: PipelineBehaviorValidationContext,
    ): PipelineBehaviorDiagnostic[] | undefined => {
      const options = context.effectiveOptions as
        | FeatureFlagBehaviorOptions
        | undefined;

      if (
        options?.flag !== undefined &&
        (typeof options.flag !== 'string' || options.flag.trim() === '')
      ) {
        return [
          {
            handlerName: context.handlerName,
            behaviorName: FeatureFlagBehavior.name,
            message:
              'FeatureFlagBehavior `flag` option must be a non-empty string',
            fix: 'Provide a valid string flag name in options or omit options for pass-through.',
          },
        ];
      }

      if (
        (context.declarationSource === 'handler' ||
          context.declarationSource === 'both') &&
        options?.flag === undefined
      ) {
        return [
          {
            handlerName: context.handlerName,
            behaviorName: FeatureFlagBehavior.name,
            message:
              'Explicit FeatureFlagBehavior intent requires a non-empty `flag` name',
            fix: 'Provide flag in @UsePipeline([FeatureFlagBehavior, { flag: "flag-name" }]).',
          },
        ];
      }

      return undefined;
    },
  };

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
    const options = this.resolveEffectiveOptions(
      context.getBehaviorOptions<FeatureFlagBehaviorOptions>(
        FeatureFlagBehavior,
      ),
    );

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

    // Publish the decision before applying the throw policy so outer audit and
    // telemetry behaviors can observe provider failures.
    setPipelineItem(context, FEATURE_FLAG_KEY_ITEM_TOKEN, options.flag);
    setPipelineItem(context, FEATURE_FLAG_ITEM_TOKEN, enabled);
    setPipelineItem(context, FEATURE_FLAG_DECISION_ITEM_TOKEN, decision);

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

    const state = enabled ? 'enabled' : 'disabled';
    this.logger.debug?.(
      `Feature "${options.flag}" ${state} for ${context.requestName}${variantSuffix}${reasonSuffix}`,
      FeatureFlagBehavior.name,
    );

    if (enabled) return next();
    if (options.fallback) return options.fallback(context);
    throw new FeatureDisabledError(options.flag, context.requestName);
  }

  /**
   * Resolves OpenFeature details without applying the handler's error policy.
   *
   * Provider failures are normalized into a decision plus a `failure`
   * descriptor so the caller can publish telemetry/audit state before deciding
   * whether to use the default value or throw.
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

  /** Shallow-merges pipeline-level options over the application defaults. */
  resolveEffectiveOptions(
    options?: FeatureFlagBehaviorOptions,
  ): FeatureFlagBehaviorOptions {
    return options ? { ...this.defaults, ...options } : this.defaults;
  }
}
