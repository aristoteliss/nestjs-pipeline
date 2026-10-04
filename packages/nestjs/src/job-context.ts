/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type IJobPrincipal,
  type JobContextOptions,
  type JobContextSources,
  registerJobContext,
} from '@cqrs-ddd/pipeline-job-context';
import {
  type DynamicModule,
  Inject,
  Injectable,
  Module,
  type ModuleMetadata,
  type OnApplicationShutdown,
  type Type,
} from '@nestjs/common';

/** How `JobContextModule` registers the job context. */
export interface JobContextModuleOptions {
  /** Modules that provide the principal's dependencies. */
  readonly imports?: ModuleMetadata['imports'];
  /** The provider that loads a job's principal again. */
  readonly principal: Type<IJobPrincipal>;
  /** The tenants a job may name, or a function read when the module starts. */
  readonly tenants: readonly string[] | (() => readonly string[]);
  /** Where the tenant and correlation id are read and restored. */
  readonly sources: JobContextSources;
}

const JOB_PRINCIPAL = Symbol('JOB_PRINCIPAL');
const JOB_CONTEXT = Symbol('JOB_CONTEXT');

@Injectable()
class JobContextRegistration implements OnApplicationShutdown {
  private readonly unregister: () => void;

  constructor(@Inject(JOB_CONTEXT) options: JobContextOptions) {
    this.unregister = registerJobContext(options);
  }

  onApplicationShutdown(): void {
    this.unregister();
  }
}

/**
 * Lets the jobs a request enqueues carry its tenant, correlation id and
 * principal (`withJobContext`), and restores them in processors
 * (`@InJobContext()`): registers the application's job principal, tenants and
 * context sources with `@cqrs-ddd/pipeline-job-context` when the module starts,
 * and unregisters them on shutdown.
 *
 * @example
 * ```ts
 * @Module({
 *   imports: [
 *     JobContextModule.forRoot({
 *       imports: [AuthsModule],
 *       principal: SessionJobPrincipal,
 *       tenants: () => persistenceConfig().tenants,
 *       sources: { tenantId: tenantSource, correlationId: correlationSource },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class JobContextModule {
  static forRoot(options: JobContextModuleOptions): DynamicModule {
    const { tenants, sources } = options;
    return {
      module: JobContextModule,
      imports: options.imports ?? [],
      providers: [
        { provide: JOB_PRINCIPAL, useClass: options.principal },
        {
          provide: JOB_CONTEXT,
          inject: [JOB_PRINCIPAL],
          useFactory: (principal: IJobPrincipal): JobContextOptions => ({
            principal,
            tenants: typeof tenants === 'function' ? tenants() : tenants,
            sources,
          }),
        },
        JobContextRegistration,
      ],
    };
  }
}
