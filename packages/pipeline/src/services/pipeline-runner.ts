/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  pipelineStore,
  SET_CORRELATION_ID,
  SET_RESPONSE,
  SET_TENANT_ID,
} from '../constants/pipeline-context.constants';
import { uuidv7 } from '../helpers/uuidv7';
import type {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import type { PipelineHandlerMeta } from '../interfaces/pipeline-handler-meta.interface';
import type { PipelineModuleOptions } from '../options/pipeline-module.options';
import { PipelineContext } from '../pipeline.context';

export type PipelineRunner = (
  self: unknown,
  request: unknown,
) => Promise<unknown>;

/** Builds a request-local chain; dynamic DI remains owned by the Nest adapter. */
export function createPipelineRunner(
  originalMethod: (this: unknown, request: unknown) => unknown,
  meta: PipelineHandlerMeta,
  behaviors:
    | readonly IPipelineBehavior[]
    | ((self: unknown, request: unknown) => Promise<IPipelineBehavior[]>),
  hasPipeline: boolean,
  options?: PipelineModuleOptions,
): PipelineRunner {
  const { correlationIdFactory, correlationIdRunner, tenantIdFactory } =
    options ?? {};
  return async (self, request) => {
    if (!hasPipeline) return originalMethod.call(self, request);
    const context = new PipelineContext(request, meta);
    const localBehaviors =
      typeof behaviors === 'function'
        ? await behaviors(self, request)
        : behaviors;
    if (!context.correlationId) {
      context[SET_CORRELATION_ID](correlationIdFactory?.() ?? uuidv7());
    }

    if (!context.tenantId && tenantIdFactory) {
      const resolvedTenantId = tenantIdFactory();
      if (resolvedTenantId !== undefined) {
        context[SET_TENANT_ID](resolvedTenantId);
      }
    }

    let chain: NextDelegate = async () => {
      const result = await originalMethod.call(self, request);
      context[SET_RESPONSE](result);
      return result;
    };

    for (let i = localBehaviors.length - 1; i >= 0; i--) {
      const behavior = localBehaviors[i];
      const nextInChain = chain;
      chain = () => behavior.handle(context, nextInChain);
    }

    // Run inside the pipeline async-local store so child handlers
    // (saga / nested dispatch) inherit the correlation ID.
    // When correlationIdRunner is provided, also wrap in the correlation
    // store so getCorrelationId() returns the pipeline's correlation ID.
    const runChain = () => pipelineStore.run(context, chain);
    if (correlationIdRunner) {
      return correlationIdRunner(context.correlationId, runChain);
    }
    return runChain();
  };
}
