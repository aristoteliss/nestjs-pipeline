/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { JobContextRegistration } from '@common/context/job-context.registration.js';
import { PipelineErrorFilter } from '@common/filters/pipeline-error.filter.js';
import { AuthSessionGuard } from '@common/guards/auth-session.guard.js';
import { SessionPrincipalContextInterceptor } from '@common/interceptors/session-principal-context.interceptor.js';
import { zodBadRequest } from '@common/validation/zod-bad-request.js';
import { httpCorrelation } from '@cqrs-ddd/pipeline-correlation';
import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { TenantSchemaMiddleware } from '@persistence/middlewares/tenant-schema.middleware.js';
import { PersistenceModule } from '@persistence/persistence.module.js';
import { AuthorizationModule } from './auths/authorization.module.js';
import { AuthsModule } from './auths/auths.module.js';
import { SessionJobPrincipal } from './auths/infrastructure/session-job-principal.js';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter.js';
import {
  ObservabilityModule,
  ReliabilityModule,
} from './common/modules/index.js';
import { RolesModule } from './roles/roles.module.js';
import { UsersModule } from './users/users.module.js';

/**
 * Root composition module of the Users API application.
 *
 * Orchestrates cross-cutting infrastructure concerns (Observability, Reliability, Persistence,
 * CASL Authorization, CQRS) alongside business domain modules (Users, Roles, Auths).
 *
 * ### Architectural Layout
 * - {@link ObservabilityModule}: Structured logging (Pino), OpenTelemetry tracing & metrics, global pipeline behaviors, and audit logging.
 * - {@link ReliabilityModule}: BullMQ queue engine, dead-letter storage, rate limiting, distributed idempotency, resilience policies, caching, and feature flags.
 * - {@link AuthorizationModule}: role- and attribute-based access control (`CaslBehavior`, `CaslAuthorizer`) on the application's permission source.
 * - {@link PersistenceModule}: MikroORM database connection, entity repositories, and tenant schema manager.
 * - {@link JobContextRegistration}: carries a request's tenant, correlation id and principal into the jobs it enqueues.
 * - `StandardSchemaValidationPipe`: validates every route parameter declared with a `schema` and answers 400 with {@link zodBadRequest}'s body.
 * - Exception filters: {@link PipelineErrorFilter} for the behaviors' errors, {@link DomainExceptionFilter} for the domain's.
 * - `httpCorrelation()`: takes or creates the correlation id of every request.
 * - Domain Feature Modules: {@link UsersModule}, {@link RolesModule}, {@link AuthsModule}.
 */
@Module({
  imports: [
    CqrsModule.forRoot(),
    ObservabilityModule,
    ReliabilityModule,
    AuthorizationModule,
    PersistenceModule,
    UsersModule,
    RolesModule,
    AuthsModule,
  ],
  providers: [
    SessionJobPrincipal,
    JobContextRegistration,
    { provide: APP_GUARD, useClass: AuthSessionGuard },
    { provide: APP_INTERCEPTOR, useClass: SessionPrincipalContextInterceptor },
    {
      provide: APP_PIPE,
      useValue: new StandardSchemaValidationPipe({
        exceptionFactory: zodBadRequest,
      }),
    },
    { provide: APP_FILTER, useClass: PipelineErrorFilter },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  constructor(
    private readonly tenantSchemaMiddleware: TenantSchemaMiddleware,
  ) {}

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        httpCorrelation(),
        this.tenantSchemaMiddleware.use.bind(this.tenantSchemaMiddleware),
      )
      .forRoutes('*');
  }
}
