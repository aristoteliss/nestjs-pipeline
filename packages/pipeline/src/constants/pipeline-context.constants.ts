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

import { AsyncLocalStorage } from 'node:async_hooks';
import { IPipelineContext } from '../interfaces/pipeline.context.interface';

/**
 * Async-local store that propagates pipeline context across the async call chain.
 * When a saga or nested CommandBus.execute() triggers a child handler,
 * the child's PipelineContext inherits the parent's correlationId automatically.
 *
 * Stores a reference to the live context object — any changes made by behaviors
 * (e.g. setting correlationId from an HTTP header) are visible to child pipelines.
 *
 * Uses Node.js built-in `AsyncLocalStorage` — zero external dependencies.
 */
export const pipelineStore = new AsyncLocalStorage<IPipelineContext>();

/**
 * Symbol-keyed setter for `response`. Only code that imports this symbol
 * can write to `context.response` — keeping it readonly for behaviors.
 *
 * @internal — used exclusively by {@link PipelineBootstrapService}.
 */
export const SET_RESPONSE: unique symbol = Symbol(
  'PipelineContext.setResponse',
);

/**
 * Symbol-keyed setter for `originalCorrelationId`. Only code that imports
 * this symbol can write — making the field effectively immutable to behaviors.
 *
 * @internal — used exclusively by {@link PipelineBootstrapService}.
 */
export const SET_ORIGINAL_CORRELATION_ID: unique symbol = Symbol(
  'PipelineContext.setOriginalCorrelationId',
);
