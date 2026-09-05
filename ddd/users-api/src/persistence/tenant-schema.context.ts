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
