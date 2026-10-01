/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type DynamicModule,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  JOB_PRINCIPAL,
  JOB_SOURCES,
  JOB_TENANTS,
} from './constants/job-context.constants.js';
import {
  type Registration,
  register,
  unregister,
} from './helpers/registration.js';
import type { JobContextSources } from './interfaces/context-source.interface.js';
import type { JobContextOptions } from './interfaces/job-context-options.interface.js';
import type { IJobPrincipal } from './interfaces/job-principal.interface.js';

/**
 * Registers the principal port, tenants and sources when it is constructed, before any
 * lifecycle hook can start a worker, and removes them at shutdown.
 */
@Injectable()
class JobContextRegistration implements OnApplicationShutdown {
  private readonly registration: Registration;

  constructor(
    @Inject(JOB_PRINCIPAL) principal: IJobPrincipal,
    @Inject(JOB_TENANTS) tenants: readonly string[],
    @Inject(JOB_SOURCES) sources: JobContextSources,
  ) {
    this.registration = { principal, tenants, sources };
    register(this.registration);
  }

  onApplicationShutdown(): void {
    unregister(this.registration);
  }
}

/**
 * Connects `withJobContext`, `@InJobContext` and `@AsSystem` to the
 * application's principal port, tenant list, and tenant and correlation id
 * sources. The decorators wrap methods
 * outside dependency injection, so they read the registration of the running
 * module; with none they fail closed. One application registers it once.
 *
 * @example
 * ```ts
 * @Module({
 *   imports: [
 *     JobContextModule.forRoot({
 *       principal: SessionJobPrincipal,
 *       tenants: ['tenant_a', 'tenant_b'],
 *       sources: { tenantId: tenantSource, correlationId: correlationSource },
 *       imports: [AuthsModule],
 *     }),
 *   ],
 * })
 * export class JobsModule {}
 * ```
 */
@Module({})
export class JobContextModule {
  /**
   * Builds the module for `options`.
   *
   * @throws {TypeError} When `options.tenants` is an empty list. A tenant
   *   function that returns an empty list throws when the application starts.
   *
   * @example
   * ```ts
   * JobContextModule.forRoot({
   *   principal: SessionJobPrincipal,
   *   tenants: () => persistenceConfig().tenants,
   *   sources: { tenantId: tenantSource, correlationId: correlationSource },
   * });
   * ```
   */
  static forRoot(options: JobContextOptions): DynamicModule {
    const { tenants } = options;
    return {
      module: JobContextModule,
      imports: options.imports ?? [],
      providers: [
        { provide: JOB_PRINCIPAL, useClass: options.principal },
        typeof tenants === 'function'
          ? { provide: JOB_TENANTS, useFactory: () => toTenantList(tenants()) }
          : { provide: JOB_TENANTS, useValue: toTenantList(tenants) },
        { provide: JOB_SOURCES, useValue: options.sources },
        JobContextRegistration,
      ],
    };
  }
}

function toTenantList(tenants: readonly string[]): string[] {
  if (tenants.length === 0) {
    throw new TypeError('JobContextModule needs at least one tenant.');
  }
  return [...tenants];
}
