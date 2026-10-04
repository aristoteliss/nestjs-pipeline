/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { registerJobContext } from '@cqrs-ddd/pipeline-job-context';
import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { persistenceConfig } from '@persistence/persistence.config.js';
import { SessionJobPrincipal } from '../../auths/infrastructure/session-job-principal.js';
import { contextSources } from './context-sources.js';

/**
 * Lets the jobs a request enqueues carry its tenant, correlation id and
 * principal (`withJobContext`), and restores them in processors
 * (`@InJobContext()`): registers this application's job principal, tenants and
 * context sources with `@cqrs-ddd/pipeline-job-context` when it is built, and
 * unregisters them on shutdown.
 *
 * @example
 * ```ts
 * @Module({ imports: [AuthsModule], providers: [SessionJobPrincipal, JobContextRegistration] })
 * export class AppModule {}
 * ```
 */
@Injectable()
export class JobContextRegistration implements OnApplicationShutdown {
  private readonly unregister: () => void;

  constructor(principal: SessionJobPrincipal) {
    this.unregister = registerJobContext({
      principal,
      tenants: persistenceConfig().tenants,
      sources: contextSources,
    });
  }

  onApplicationShutdown(): void {
    this.unregister();
  }
}
