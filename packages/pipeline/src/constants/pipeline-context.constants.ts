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
 * Stores a reference to the live context object so child pipelines inherit the
 * same immutable correlation ID.
 *
 * Uses Node.js built-in `AsyncLocalStorage` — zero external dependencies.
 */
export const pipelineStore = new AsyncLocalStorage<IPipelineContext>();

/** Symbol-keyed setter for `response`. @internal */
export const SET_RESPONSE: unique symbol = Symbol(
  'PipelineContext.setResponse',
);

/** @internal Sets the correlation ID before execution begins. */
export const SET_CORRELATION_ID: unique symbol = Symbol(
  'PipelineContext.setCorrelationId',
);

/** Symbol-keyed setter for `originalCorrelationId`. @internal */
export const SET_ORIGINAL_CORRELATION_ID: unique symbol = Symbol(
  'PipelineContext.setOriginalCorrelationId',
);

/** Symbol-keyed setter for `tenantId`. @internal */
export const SET_TENANT_ID: unique symbol = Symbol(
  'PipelineContext.setTenantId',
);

/**
 * Unique symbol key used on `context.items` for explicit tenant ID storage.
 */
export const PIPELINE_TENANT_ID: unique symbol = Symbol('PIPELINE_TENANT_ID');

/**
 * Neutral authorization/security scope for downstream short-circuit behaviors.
 *
 * Authentication/authorization behaviors should populate this item before cache
 * or idempotency behaviors execute. The value must be deterministic JSON data
 * representing every security dimension that can alter a response (for example
 * principal identity and effective authorization rules).
 *
 * Consumers intentionally live in core so cache, CASL, or another authorization
 * package do not need to depend on each other.
 */
export const PIPELINE_SECURITY_SCOPE: unique symbol = Symbol(
  'PIPELINE_SECURITY_SCOPE',
);
