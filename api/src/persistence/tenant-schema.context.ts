/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MissingTenantContextError } from '@cqrs-ddd/core/domain';
import { Injectable } from '@nestjs/common';
import { currentTenantId, runWithTenant } from '@nestjs-pipeline/tenant';
import { tenantSchema } from './persistence.config';

/**
 * Validates and resolves the active tenant schema.
 *
 * It reads and writes the tenant of `@nestjs-pipeline/tenant`, the one tenant
 * store the database store, the pipeline and core's tenant-scoped cache keys
 * share. It fails closed: work outside {@link run} or a pipeline execution has
 * no tenant, and reading {@link schema} there throws instead of falling back to
 * a default tenant.
 */
@Injectable()
export class TenantSchemaContext {
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
    return runWithTenant(tenantSchema(schema), callback);
  }

  /**
   * The active tenant, validated on every read: the tenant store also accepts
   * tenants set through `runWithTenant` directly.
   *
   * @throws {MissingTenantContextError} Outside {@link run} and outside a
   *   pipeline execution that has a tenant.
   * @throws {InvalidTenantSchemaError} When the active tenant is not a valid
   *   name.
   *
   * @example
   * ```ts
   * const tenant = tenantContext.schema;
   * ```
   */
  get schema(): string {
    const schema = currentTenantId();
    if (schema === undefined) {
      throw new MissingTenantContextError('reading the active tenant');
    }
    return tenantSchema(schema);
  }
}
