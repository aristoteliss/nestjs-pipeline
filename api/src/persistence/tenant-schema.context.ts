/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { normalizeSchemaName } from './postgres-options';

type TenantSchemaStore = {
  schema: string;
};

@Injectable()
/**
 * Stores and resolves the active tenant schema per async execution context.
 */
export class TenantSchemaContext {
  private readonly storage = new AsyncLocalStorage<TenantSchemaStore>();

  run<T>(schema: string | undefined, callback: () => T): T {
    const normalizedSchema = normalizeSchemaName(schema);
    return this.storage.run({ schema: normalizedSchema }, callback);
  }

  get schema(): string {
    return this.storage.getStore()?.schema ?? normalizeSchemaName(undefined);
  }
}
