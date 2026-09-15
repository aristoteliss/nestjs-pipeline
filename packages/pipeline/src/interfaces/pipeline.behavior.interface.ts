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
