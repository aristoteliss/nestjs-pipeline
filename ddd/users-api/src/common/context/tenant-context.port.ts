/*
 * Copyright (C) 2026-present Aristotelis
 * See repository license for full terms.
 */

/**
 * Application-facing tenant execution context.
 *
 * Application services depend on this port instead of the persistence-owned
 * AsyncLocalStorage implementation. Infrastructure is responsible for binding
 * the port to the concrete tenant context adapter.
 */
export interface ITenantContext {
  /** Active normalized tenant identifier for the current execution. */
  readonly schema: string;
}

/** DI token used by application code to access the active tenant context. */
export const TENANT_CONTEXT = Symbol('TENANT_CONTEXT');
