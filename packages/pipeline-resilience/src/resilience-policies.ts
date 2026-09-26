/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  Inject,
  Injectable,
  Logger,
  type LoggerService,
  Optional,
} from '@nestjs/common';
import { LOGGING_BEHAVIOR_LOGGER } from '@nestjs-pipeline/core';
import type { IDefaultPolicyContext } from 'cockatiel';
import {
  getResiliencePolicyToken,
  RESILIENCE_POLICY_OPTIONS,
} from './constants/tokens';
import { ResiliencePolicyConfigurationError } from './errors/resilience-policy-configuration.error';
import {
  type AnyPolicy,
  buildResiliencePolicy,
} from './helpers/policy-factory';
import type { ResiliencePolicyOptions } from './interfaces/resilience-options.interface';

/**
 * The named policies of the application, for outbound adapters: a payment API
 * client, an SMTP sender, a partner webhook.
 *
 * Every policy declared in `ResilienceModule.forRoot({ policies })` (or
 * `forRootAsync`) is built once, when this registry is created at startup, and
 * shared by every caller — so a circuit breaker or bulkhead tracks the
 * dependency, whatever handler calls it. An invalid policy fails startup with
 * {@link ResiliencePolicyConfigurationError}.
 *
 * @example An adapter running its call through a shared policy
 * ```ts
 * @Injectable()
 * export class PaymentsClient {
 *   constructor(private readonly policies: ResiliencePolicies) {}
 *
 *   charge(order: Order): Promise<Receipt> {
 *     return this.policies.execute('paymentsApi', ({ signal }) =>
 *       this.http.post('/charges', order, { signal }),
 *     );
 *   }
 * }
 * ```
 */
@Injectable()
export class ResiliencePolicies {
  private readonly policies = new Map<string, AnyPolicy>();

  constructor(
    @Optional()
    @Inject(RESILIENCE_POLICY_OPTIONS)
    options?: Record<string, ResiliencePolicyOptions>,
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    logger?: LoggerService,
  ) {
    const log =
      logger ?? new Logger(ResiliencePolicies.name, { timestamp: true });
    for (const [name, policyOptions] of Object.entries(options ?? {})) {
      this.policies.set(name, buildNamedPolicy(name, policyOptions, log));
    }
  }

  /** The declared policy names, in declaration order. */
  get names(): readonly string[] {
    return [...this.policies.keys()];
  }

  /**
   * Returns the shared cockatiel policy declared under `name`.
   *
   * @throws ResiliencePolicyConfigurationError when no policy has that name.
   */
  get(name: string): AnyPolicy {
    const policy = this.policies.get(name);
    if (!policy) {
      const declared = this.names.length > 0 ? this.names.join(', ') : '(none)';
      throw new ResiliencePolicyConfigurationError(
        name,
        `no policy has this name; declared: ${declared}`,
      );
    }
    return policy;
  }

  /**
   * Runs `fn` through the policy declared under `name`. `fn` receives the
   * policy's `signal`, aborted on a cooperative timeout: pass it to the
   * outbound call so the call really stops. With a fallback, the fallback
   * value is returned in place of a handled failure.
   *
   * @throws ResiliencePolicyConfigurationError when no policy has that name.
   */
  execute<T>(
    name: string,
    fn: (context: IDefaultPolicyContext) => PromiseLike<T> | T,
  ): Promise<T> {
    return this.get(name).execute(fn) as Promise<T>;
  }
}

/**
 * Injects the shared policy declared under `name` into a constructor
 * parameter, for an adapter that uses one policy. The name must be declared in
 * `ResilienceModule.forRoot({ policies })`, or listed in `policyNames` for
 * `forRootAsync`.
 *
 * @example
 * ```ts
 * constructor(@InjectResiliencePolicy('paymentsApi') private readonly policy: IPolicy) {}
 * ```
 */
export function InjectResiliencePolicy(
  name: string,
): PropertyDecorator & ParameterDecorator {
  return Inject(getResiliencePolicyToken(name));
}

function buildNamedPolicy(
  name: string,
  options: ResiliencePolicyOptions,
  logger: LoggerService,
): AnyPolicy {
  const classifiesErrors =
    typeof options.handle === 'function' || options.handleAllErrors === true;
  if (
    (options.retry || options.circuitBreaker || options.fallback) &&
    !classifiesErrors
  ) {
    throw new ResiliencePolicyConfigurationError(
      name,
      'retry, circuitBreaker and fallback require handle(error) or handleAllErrors: true',
    );
  }

  const policy = buildResiliencePolicy(options, { logger, policyName: name });
  if (!policy) {
    throw new ResiliencePolicyConfigurationError(
      name,
      'it configures no layer (retry, circuitBreaker, bulkhead, timeout or fallback)',
    );
  }
  return policy;
}
