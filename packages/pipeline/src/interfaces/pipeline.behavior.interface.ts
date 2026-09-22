/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IPipelineContext } from './pipeline.context.interface';

/**
 * Delegate to call the next behavior in the chain, or the real handler.
 */
export type NextDelegate<TResponse = unknown> = () => Promise<TResponse>;

/**
 * Interface every pipeline behavior must implement.
 * Works for command handlers, query handlers, AND event handlers.
 *
 * Sagas don't need wrapping — they are reactive stream factories.
 * Any commands a saga emits will flow through the CommandBus and
 * hit the pipeline of the target command handler automatically.
 */
export interface IPipelineBehavior<TRequest = unknown, TResponse = unknown> {
  handle(
    context: IPipelineContext<TRequest, TResponse>,
    next: NextDelegate<TResponse>,
  ): Promise<TResponse>;
}

/**
 * Optional instance contract for a behavior that merges its module defaults into
 * the options declared on a handler or globally. Bootstrap diagnostics call it on
 * pre-resolved singleton behaviors so contract validators receive the options the
 * behavior will apply; scoped behaviors have no instance at bootstrap and their
 * validators receive the raw declared options.
 *
 * @example
 * ```ts
 * class CacheBehavior
 *   implements IPipelineBehavior, IPipelineBehaviorOptionsResolver<CacheOptions>
 * {
 *   resolveEffectiveOptions(options?: CacheOptions): CacheOptions {
 *     return { ...this.defaults, ...options };
 *   }
 * }
 * ```
 */
export interface IPipelineBehaviorOptionsResolver<
  TOptions extends object = Record<string, unknown>,
> {
  resolveEffectiveOptions(options?: TOptions): TOptions | undefined;
}
