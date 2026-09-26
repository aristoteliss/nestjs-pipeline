/* Copyright (C) 2026-present Aristotelis — see repository license. */

// Re-export the most useful cockatiel error types & enums so consumers can
// detect resilience outcomes without importing cockatiel directly.
export {
  BrokenCircuitError,
  BulkheadRejectedError,
  CircuitState,
  IsolatedCircuitError,
  isBrokenCircuitError,
  isBulkheadRejectedError,
  isIsolatedCircuitError,
  isTaskCancelledError,
  TaskCancelledError,
} from 'cockatiel';
export {
  getResiliencePolicyToken,
  RESILIENCE_DEFAULT_OPTIONS,
} from './constants/tokens';
export { ResilienceConfigurationError } from './errors/resilience-configuration.error';
export { ResiliencePolicyConfigurationError } from './errors/resilience-policy-configuration.error';
export {
  buildResiliencePolicy,
  type PolicyBuildContext,
} from './helpers/policy-factory';
export {
  type ResilienceIntentOptions,
  resilience,
} from './helpers/resilience.intent';
export { getResilienceAbortSignal } from './helpers/resilience-context';
export type {
  BreakerStrategy,
  BulkheadOptions,
  CircuitBreakerOptions,
  FallbackOptions,
  HandlerResilienceLayer,
  JitterStrategy,
  ResilienceBehaviorOptions,
  ResilienceLayer,
  ResilienceModuleAsyncOptions,
  ResilienceModuleOptions,
  ResiliencePolicyOptions,
  ResilienceTelemetry,
  ResilienceTelemetryEvent,
  RetryBackoff,
  RetryOptions,
  RetryPolicyOptions,
  TimeoutOptions,
  TimeoutPolicyOptions,
} from './interfaces/resilience-options.interface';
export { ResilienceBehavior } from './resilience.behavior';
export { ResilienceModule } from './resilience.module';
export {
  InjectResiliencePolicy,
  ResiliencePolicies,
} from './resilience-policies';
