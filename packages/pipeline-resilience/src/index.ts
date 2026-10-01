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
} from './constants/tokens.js';
export { ResilienceConfigurationError } from './errors/resilience-configuration.error.js';
export { ResiliencePolicyConfigurationError } from './errors/resilience-policy-configuration.error.js';
export {
  type AnyPolicy,
  buildResiliencePolicy,
  type PolicyBuildContext,
} from './helpers/policy-factory.js';
export {
  type ResilienceIntentOptions,
  resilience,
} from './helpers/resilience.intent.js';
export { getResilienceAbortSignal } from './helpers/resilience-context.js';
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
} from './interfaces/resilience-options.interface.js';
export { ResilienceBehavior } from './resilience.behavior.js';
export { ResilienceModule } from './resilience.module.js';
export {
  InjectResiliencePolicy,
  ResiliencePolicies,
} from './resilience-policies.js';
