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
export { RESILIENCE_DEFAULT_OPTIONS } from './constants/tokens';
export { ResilienceConfigurationError } from './errors/resilience-configuration.error';
export {
  buildResiliencePolicy,
  type PolicyBuildContext,
} from './helpers/policy-factory';
export {
  getResilienceAbortSignal,
  RESILIENCE_ABORT_SIGNAL_ITEM,
} from './helpers/resilience-context';
export type {
  BreakerStrategy,
  BulkheadOptions,
  CircuitBreakerOptions,
  FallbackOptions,
  JitterStrategy,
  ResilienceBehaviorOptions,
  ResilienceLayer,
  ResilienceTelemetry,
  RetryBackoff,
  RetryOptions,
  TimeoutOptions,
} from './interfaces/resilience-options.interface';
export { ResilienceBehavior } from './resilience.behavior';
export { ResilienceModule } from './resilience.module';
