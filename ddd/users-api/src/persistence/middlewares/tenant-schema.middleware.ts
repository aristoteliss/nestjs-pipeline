/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AUTH_HEADERS } from '@common/constants/auth-headers.constants';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  type NestMiddleware,
} from '@nestjs/common';
import {
  normalizeSchemaName,
  resolveAllowedTenantSchemas,
} from '../postgres-options';
import { TenantSchemaContext } from '../tenant-schema.context';
import { InvalidTenantSchemaError } from '../tenant-schema.errors';

@Injectable()
/**
 * Resolves tenant schema from the incoming request header and runs the request
 * inside the tenant async context used by persistence components.
 */
export class TenantSchemaMiddleware implements NestMiddleware {
  constructor(private readonly tenantSchemaContext: TenantSchemaContext) {}

  use(
    request: { headers?: Record<string, string | string[] | undefined> },
    _response: unknown,
    next: () => void,
  ): void {
    const rawHeaderValue = request.headers?.[AUTH_HEADERS.TENANT_SCHEMA];
    const headerValue = Array.isArray(rawHeaderValue)
      ? rawHeaderValue[0]
      : rawHeaderValue;

    if (!headerValue) {
      throw new ForbiddenException(
        'Tenant context is required to process this request.',
      );
    }

    const schema = this.parseSchema(headerValue);
    if (!resolveAllowedTenantSchemas().has(schema)) {
      throw new ForbiddenException('Unknown tenant context.');
    }

    this.tenantSchemaContext.run(schema, () => {
      next();
    });
  }

  private parseSchema(headerValue: string): string {
    try {
      return normalizeSchemaName(headerValue);
    } catch (error) {
      if (error instanceof InvalidTenantSchemaError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
