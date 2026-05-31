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
