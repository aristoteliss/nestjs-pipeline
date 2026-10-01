/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { HEADERS } from '@common/constants/headers.constants.js';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  type NestMiddleware,
} from '@nestjs/common';
import { tenantSchema } from '../persistence.config.js';
import { TenantSchemaContext } from '../tenant-schema.context.js';
import { InvalidTenantSchemaError } from '../tenant-schema.errors.js';

@Injectable()
/**
 * Resolves tenant schema from the incoming request header and runs the request
 * inside the tenant async context used by persistence components.
 */
export class TenantSchemaMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantSchemaContext: TenantSchemaContext,
    private readonly tenants: ReadonlySet<string>,
  ) {}

  use(
    request: { headers?: Record<string, string | string[] | undefined> },
    _response: unknown,
    next: () => void,
  ): void {
    const rawHeaderValue = request.headers?.[HEADERS.TENANT_SCHEMA];
    const headerValue = Array.isArray(rawHeaderValue)
      ? rawHeaderValue[0]
      : rawHeaderValue;

    if (!headerValue) {
      throw new ForbiddenException(
        'Tenant context is required to process this request.',
      );
    }

    const schema = this.parseSchema(headerValue);
    if (!this.tenants.has(schema)) {
      throw new ForbiddenException('Unknown tenant context.');
    }

    this.tenantSchemaContext.run(schema, () => {
      next();
    });
  }

  private parseSchema(headerValue: string): string {
    try {
      return tenantSchema(headerValue);
    } catch (error) {
      if (error instanceof InvalidTenantSchemaError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
