/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  FEATURE_FLAGS_CLIENT,
  FEATURE_FLAGS_DEFAULT_CONTEXT,
  FEATURE_FLAGS_DEFAULT_OPTIONS,
  FEATURE_FLAGS_TARGETING_KEY_FACTORY,
} from './constants/tokens';
export { FeatureDisabledError } from './errors/feature-disabled.error';
export { FeatureFlagEvaluationError } from './errors/feature-flag-evaluation.error';
export {
  FEATURE_FLAG_DECISION_ITEM,
  FEATURE_FLAG_ITEM,
  FEATURE_FLAG_KEY_ITEM,
  FeatureFlagBehavior,
} from './feature-flag.behavior';
export { FeatureFlagsModule } from './feature-flags.module';
export {
  baseEvaluationContext,
  buildEvaluationContext,
} from './helpers/evaluation-context';
export type {
  EvaluationContextFactory,
  FeatureFallbackFactory,
  FeatureFlagBehaviorOptions,
  FeatureFlagDecision,
  FeatureFlagErrorPolicy,
  FeatureFlagsModuleOptions,
  TargetingKeyFactory,
} from './interfaces/feature-flags-options.interface';
