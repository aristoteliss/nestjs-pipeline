/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import { MissingTenantContextError } from '@cqrs-ddd/core/domain';
import { Injectable } from '@nestjs/common';
import { tenantSchema } from './persistence.config';

type TenantSchemaStore = {
  schema: string;
};

/**
 * Stores and resolves the active tenant schema per async execution context.
 *
 * It fails closed: work outside {@link run} has no tenant, and reading
 * {@link schema} there throws instead of falling back to a default tenant.
 */
@Injectable()
export class TenantSchemaContext {
  private readonly storage = new AsyncLocalStorage<TenantSchemaStore>();

  /**
   * Runs `callback` with `schema` as the active tenant.
   *
   * @throws {MissingTenantContextError} When `schema` is `undefined`, as in a
   *   job payload that carries no tenant.
   * @throws {InvalidTenantSchemaError} When `schema` is not a valid name.
   *
   * @example
   * ```ts
   * await tenantContext.run(job.data.tenant, () => this.process(job));
   * ```
   */
  run<T>(schema: string | undefined, callback: () => T): T {
    if (schema === undefined) {
      throw new MissingTenantContextError('a tenant-scoped run');
    }
    return this.storage.run({ schema: tenantSchema(schema) }, callback);
  }

  /**
   * The active tenant.
   *
   * @throws {MissingTenantContextError} Outside {@link run}.
   *
   * @example
   * ```ts
   * const tenant = tenantContext.schema;
   * ```
   */
  get schema(): string {
    const schema = this.storage.getStore()?.schema;
    if (schema === undefined) {
      throw new MissingTenantContextError('reading the active tenant');
    }
    return schema;
  }

  /**
   * The active tenant, or `undefined` outside {@link run}. For callers that
   * must not throw, such as the pipeline's `tenantIdFactory`, which leaves the
   * tenant unset so tenant-scoped behaviors fail closed on their own.
   *
   * @example
   * ```ts
   * PipelineModule.forRoot({ tenantIdFactory: () => tenantContext.current });
   * ```
   */
  get current(): string | undefined {
    return this.storage.getStore()?.schema;
  }
}
