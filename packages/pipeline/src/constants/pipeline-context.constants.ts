/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import { IPipelineContext } from '../interfaces/pipeline.context.interface';

/**
 * Async-local store that propagates pipeline context across the async call chain.
 * When a saga or nested CommandBus.execute() triggers a child handler,
 * the child's PipelineContext inherits the parent's correlationId automatically.
 *
 * Stores a reference to the live context object so child pipelines inherit the
 * same immutable correlation ID.
 *
 * Uses Node.js built-in `AsyncLocalStorage` — zero external dependencies.
 */
export const pipelineStore = new AsyncLocalStorage<IPipelineContext>();

/**
 * Symbol-keyed setter for `response`. Only code that imports this symbol
 * can write to `context.response` — keeping it readonly for behaviors.
 *
 * @internal Used by the pipeline runner.
 */
export const SET_RESPONSE: unique symbol = Symbol(
  'PipelineContext.setResponse',
);

/** @internal Sets the correlation ID before execution begins. */
export const SET_CORRELATION_ID: unique symbol = Symbol(
  'PipelineContext.setCorrelationId',
);

/**
 * Symbol-keyed setter for `originalCorrelationId`. Only code that imports
 * this symbol can write — making the field effectively immutable to behaviors.
 *
 * @internal Used by the pipeline runner.
 */
export const SET_ORIGINAL_CORRELATION_ID: unique symbol = Symbol(
  'PipelineContext.setOriginalCorrelationId',
);

/**
 * Symbol-keyed setter for `tenantId`. Only code that imports this symbol
 * can write to `context.tenantId`.
 *
 * @internal Used by the pipeline runner.
 */
export const SET_TENANT_ID: unique symbol = Symbol(
  'PipelineContext.setTenantId',
);

/**
 * Unique symbol key used on `context.items` for explicit tenant ID storage.
 *
 * @example
 * ```ts
 * const tenantId = context.items.get(PIPELINE_TENANT_ID) as string | undefined;
 * ```
 */
export const PIPELINE_TENANT_ID: unique symbol = Symbol('PIPELINE_TENANT_ID');
