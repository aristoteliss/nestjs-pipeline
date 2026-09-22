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
 * Symbol-keyed setter for `tenantId`. The runner assigns the tenant before the
 * behavior chain starts; a custom runner may assign it on a context it
 * constructs. The tenant is write-once: assigning a different value throws.
 */
export const SET_TENANT_ID: unique symbol = Symbol(
  'PipelineContext.setTenantId',
);
