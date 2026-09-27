/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ModuleMetadata, Type } from '@nestjs/common';
import type { IJobPrincipal } from './job-principal.interface';

/** Options of `JobContextModule.forRoot`. */
export interface JobContextOptions {
  /** The application's principal port, instantiated through dependency injection. */
  principal: Type<IJobPrincipal>;
  /**
   * Tenants a job may run in. A payload naming another tenant is refused, and
   * `@AsSystem` work runs once per tenant, in this order. Must not be empty.
   */
  tenants: readonly string[];
  /** Modules that export the dependencies of `principal`. */
  imports?: ModuleMetadata['imports'];
}
