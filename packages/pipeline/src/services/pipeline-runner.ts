/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { uuidv7 } from '@cqrs-ddd/uuidv7';
import {
  pipelineStore,
  SET_CORRELATION_ID,
  SET_RESPONSE,
  SET_TENANT_ID,
} from '../constants/pipeline-context.constants';
import type {
  ContextSource,
  ContextSources,
} from '../interfaces/context-source.interface';
import type {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import type { PipelineHandlerMeta } from '../interfaces/pipeline-handler-meta.interface';
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
  sources: ContextSources = {},
): PipelineRunner {
  return async (self, request) => {
    if (!hasPipeline) return originalMethod.call(self, request);
    const context = new PipelineContext(request, meta);
    const localBehaviors =
      typeof behaviors === 'function'
        ? await behaviors(self, request)
        : behaviors;
    const parent = pipelineStore.getStore();
    const { tenantId: tenant, correlationId: correlation } = sources;
    const tenantId = tenant ? tenant.current() : parent?.tenantId;
    const correlationId = correlation
      ? (correlation.current() ?? correlation.create())
      : (parent?.correlationId ?? uuidv7());
    context[SET_CORRELATION_ID](correlationId);
    if (tenantId !== undefined) context[SET_TENANT_ID](tenantId);

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

    // Behaviors and the handler run inside this execution's values, so a
    // nested dispatch inherits them and cannot see a different tenant.
    return pipelineStore.run(context, () =>
      within(tenant, context.tenantId, () =>
        within(correlation, context.correlationId, chain),
      ),
    );
  };
}

function within<T>(
  source: ContextSource | undefined,
  value: string | undefined,
  fn: () => T,
): T {
  return source ? source.run(value, fn) : fn();
}
