/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

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
import { DddCoreModule } from '@nestjs-pipeline/ddd-core';
import { TenantSchemaMiddleware } from '@persistence/middlewares/tenant-schema.middleware';
import { PersistenceModule } from '@persistence/persistence.module';
import { AuthsModule } from './auths/auths.module';
import { GetUserCapabilitiesQueryRepository } from './auths/repositories/get-user-capabilities.query-repository';
import { ObservabilityModule, ReliabilityModule } from './infrastructure';
import { GetRolesCapabilitiesQueryRepository } from './roles/persistence/get-roles-capabilities.query-repository';
import { RolesModule } from './roles/roles.module';
import { GetUserContextQueryRepository } from './users/persistence/get-user-context.query-repository';
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
 * - {@link CaslModule}: Dynamic role-based and attribute-based access control with database query providers.
 * - {@link DddCoreModule}: Domain-driven design entity authorizer binding.
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
      userContextResolver: GetUserContextQueryRepository,
      userCapabilityProvider: GetUserCapabilitiesQueryRepository,
      subjectContextPaths: ['sessionUser'],
      defaultFieldsFromRequest: {
        User: ['username', 'department', 'email'],
      },
    }),
    DddCoreModule,
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
