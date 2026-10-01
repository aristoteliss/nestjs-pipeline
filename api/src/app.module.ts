/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { contextSources } from '@common/context/context-sources.js';
import { AuthSessionGuard } from '@common/guards/auth-session.guard.js';
import { SessionPrincipalContextInterceptor } from '@common/interceptors/session-principal-context.interceptor.js';
import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { CaslModule, UnauthorizedActionFilter } from '@nestjs-pipeline/casl';
import { HttpCorrelationMiddleware } from '@nestjs-pipeline/correlation';
import { FeatureDisabledFilter } from '@nestjs-pipeline/feature-flags';
import { IdempotencyConflictFilter } from '@nestjs-pipeline/idempotency';
import { JobContextModule } from '@nestjs-pipeline/job-context';
import { RateLimitExceededFilter } from '@nestjs-pipeline/rate-limit';
import { ZodValidationFilter, zodBadRequest } from '@nestjs-pipeline/zod';
import { TenantSchemaMiddleware } from '@persistence/middlewares/tenant-schema.middleware.js';
import { persistenceConfig } from '@persistence/persistence.config.js';
import { PersistenceModule } from '@persistence/persistence.module.js';
import { AuthorizationModule } from './auths/authorization.module.js';
import { AuthsModule } from './auths/auths.module.js';
import { SessionJobPrincipal } from './auths/infrastructure/session-job-principal.js';
import { CaslPermissionSource } from './auths/persistence/casl-permission.source.js';
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
 * - {@link CaslModule}: Role- and attribute-based access control; {@link AuthorizationModule} supplies the request permission source.
 * - {@link PersistenceModule}: MikroORM database connection, entity repositories, and tenant schema manager.
 * - {@link JobContextModule}: carries a request's tenant, correlation id and principal into the jobs it enqueues.
 * - `StandardSchemaValidationPipe`: validates every route parameter declared with a `schema` and answers 400 with {@link zodBadRequest}'s body.
 * - Exception filters: map the packages' and the domain's framework-neutral errors to HTTP answers.
 * - Domain Feature Modules: {@link UsersModule}, {@link RolesModule}, {@link AuthsModule}.
 */
@Module({
  imports: [
    CqrsModule.forRoot(),
    ObservabilityModule,
    ReliabilityModule,
    CaslModule.forRoot({
      imports: [AuthorizationModule],
      permissionSource: { useExisting: CaslPermissionSource },
    }),
    PersistenceModule,
    UsersModule,
    RolesModule,
    AuthsModule,
    JobContextModule.forRoot({
      principal: SessionJobPrincipal,
      tenants: () => persistenceConfig().tenants,
      sources: contextSources,
      imports: [AuthsModule],
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthSessionGuard },
    { provide: APP_INTERCEPTOR, useClass: SessionPrincipalContextInterceptor },
    {
      provide: APP_PIPE,
      useValue: new StandardSchemaValidationPipe({
        exceptionFactory: zodBadRequest,
      }),
    },
    { provide: APP_FILTER, useClass: ZodValidationFilter },
    { provide: APP_FILTER, useClass: FeatureDisabledFilter },
    { provide: APP_FILTER, useClass: RateLimitExceededFilter },
    { provide: APP_FILTER, useClass: IdempotencyConflictFilter },
    { provide: APP_FILTER, useClass: UnauthorizedActionFilter },
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
        HttpCorrelationMiddleware,
        this.tenantSchemaMiddleware.use.bind(this.tenantSchemaMiddleware),
      )
      .forRoutes('*');
  }
}
