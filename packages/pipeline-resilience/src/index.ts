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
