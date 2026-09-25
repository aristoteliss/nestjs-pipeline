/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { runWithTenant } from '@cqrs-ddd/core/application';
import { Injectable } from '@nestjs/common';
import type {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@nestjs-pipeline/core';

/**
 * Runs every pipeline execution inside `@cqrs-ddd/core`'s tenant scope, using the
 * pipeline's own tenant (`tenantIdFactory`, inherited by nested dispatches).
 * Repository cache keys (`filterCacheKey`) then take the tenant without it being
 * passed at each call site; outside a pipeline they fail closed.
 */
@Injectable()
export class TenantScopeBehavior implements IPipelineBehavior {
  handle(context: IPipelineContext, next: NextDelegate): Promise<unknown> {
    return runWithTenant(context.tenantId, next);
  }
}
