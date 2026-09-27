/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type DynamicModule,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { JOB_PRINCIPAL, JOB_TENANTS } from './constants/job-context.constants';
import {
  type Registration,
  register,
  unregister,
} from './helpers/registration';
import type { JobContextOptions } from './interfaces/job-context-options.interface';
import type { IJobPrincipal } from './interfaces/job-principal.interface';

/**
 * Registers the principal port and tenants when it is constructed, before any
 * lifecycle hook can start a worker, and removes them at shutdown.
 */
@Injectable()
class JobContextRegistration implements OnApplicationShutdown {
  private readonly registration: Registration;

  constructor(
    @Inject(JOB_PRINCIPAL) principal: IJobPrincipal,
    @Inject(JOB_TENANTS) tenants: readonly string[],
  ) {
    this.registration = { principal, tenants };
    register(this.registration);
  }

  onApplicationShutdown(): void {
    unregister(this.registration);
  }
}

/**
 * Connects `withJobContext`, `@InJobContext` and `@AsSystem` to the
 * application's principal port and tenant list. The decorators wrap methods
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
   * @throws {TypeError} When `options.tenants` is empty.
   *
   * @example
   * ```ts
   * JobContextModule.forRoot({ principal: SessionJobPrincipal, tenants: ['tenant_a'] });
   * ```
   */
  static forRoot(options: JobContextOptions): DynamicModule {
    if (options.tenants.length === 0) {
      throw new TypeError('JobContextModule needs at least one tenant.');
    }
    return {
      module: JobContextModule,
      imports: options.imports ?? [],
      providers: [
        { provide: JOB_PRINCIPAL, useClass: options.principal },
        { provide: JOB_TENANTS, useValue: [...options.tenants] },
        JobContextRegistration,
      ],
    };
  }
}
