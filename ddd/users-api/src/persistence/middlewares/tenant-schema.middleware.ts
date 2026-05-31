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

import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common';
import { TenantSchemaContext } from '../tenant-schema.context';

@Injectable()
/**
 * Resolves tenant schema from the incoming request header and runs the request
 * inside the tenant async context used by persistence components.
 */
export class TenantSchemaMiddleware implements NestMiddleware {
  constructor(private readonly tenantSchemaContext: TenantSchemaContext) { }

  use(
    request: { headers?: Record<string, string | string[] | undefined> },
    _response: unknown,
    next: () => void,
  ): void {
    const rawHeaderValue = request.headers?.['x-tenant-schema'];
    const headerValue = Array.isArray(rawHeaderValue)
      ? rawHeaderValue[0]
      : rawHeaderValue;

    if (!headerValue) {
      throw new ForbiddenException(
        'Tenant context is required to process this request.',
      );
    }

    this.tenantSchemaContext.run(headerValue, () => {
      next();
    });
  }
}
