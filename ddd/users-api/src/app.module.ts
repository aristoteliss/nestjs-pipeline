/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AuthSessionGuard } from '@common/guards/auth-session.guard';
import { SessionUserContextInterceptor } from '@common/interceptors/session-user-context.interceptor';
import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { CaslModule } from '@nestjs-pipeline/casl';
import { HttpCorrelationMiddleware } from '@nestjs-pipeline/correlation';
import { TenantSchemaMiddleware } from '@persistence/middlewares/tenant-schema.middleware';
import { PersistenceModule } from '@persistence/persistence.module';
import { AuthsModule } from './auths/auths.module';
import { GetUserCapabilitiesQueryRepository } from './auths/persistence/get-user-capabilities.query-repository';
import { ObservabilityModule, ReliabilityModule } from './infrastructure';
import { GetRolesCapabilitiesQueryRepository } from './roles/persistence/get-roles-capabilities.query-repository';
import { RolesModule } from './roles/roles.module';
import { CaslUserContextResolver } from './users/persistence/casl-user-context.resolver';
import { UsersModule } from './users/users.module';

/**
 * Root composition module of the Users API application.
 *
 * Orchestrates cross-cutting infrastructure concerns (Observability, Reliability, Persistence,
 * CASL Authorization, CQRS) alongside business domain modules (Users, Roles, Auths).
 *
 * ### Architectural Layout
 * - {@link ObservabilityModule}: Structured logging (Pino), OpenTelemetry tracing & metrics, global pipeline behaviors, and audit logging.
 * - {@link ReliabilityModule}: BullMQ queue engine, dead-letter storage, rate limiting, distributed idempotency, resilience policies, caching, and feature flags.
 * - {@link CaslModule}: Dynamic role-based and attribute-based access control with dedicated request user-context resolution.
 * - {@link PersistenceModule}: MikroORM database connection, entity repositories, and tenant schema manager.
 * - Domain Feature Modules: {@link UsersModule}, {@link RolesModule}, {@link AuthsModule}.
 */
@Module({
  imports: [
    CqrsModule.forRoot(),
    ObservabilityModule,
    ReliabilityModule,
    CaslModule.forRoot({
      roleProvider: GetRolesCapabilitiesQueryRepository,
      userContextResolver: CaslUserContextResolver,
      userCapabilityProvider: GetUserCapabilitiesQueryRepository,
      subjectContextPaths: ['sessionUser'],
      defaultFieldsFromRequest: {
        User: ['username', 'department', 'email'],
      },
    }),
    PersistenceModule,
    UsersModule,
    RolesModule,
    AuthsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthSessionGuard },
    { provide: APP_INTERCEPTOR, useClass: SessionUserContextInterceptor },
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
