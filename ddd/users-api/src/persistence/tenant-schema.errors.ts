/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** A tenant schema name that is not a safe SQL identifier. */
export class InvalidTenantSchemaError extends Error {
  constructor(readonly schema: string) {
    super(`Invalid schema name: ${schema}`);
    this.name = InvalidTenantSchemaError.name;
  }
}

/**
 * The active tenant has no configured ORM. Requests are screened by
 * `TenantSchemaMiddleware`, so this signals a caller outside HTTP running with
 * an unconfigured tenant, or a broken tenant configuration.
 */
export class UnknownTenantSchemaError extends Error {
  constructor(readonly schema: string) {
    super(`Unknown tenant schema: ${schema}`);
    this.name = UnknownTenantSchemaError.name;
  }
}
