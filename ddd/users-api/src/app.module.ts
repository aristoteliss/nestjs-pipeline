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
import { TenantSchemaMiddleware } from '@persistence/middlewares/tenant-schema.middleware';
import { PersistenceModule } from '@persistence/persistence.module';
import { AuthsModule } from './auths/auths.module';
import { GetUserCapabilitiesQueryRepository } from './auths/persistence/get-user-capabilities.query-repository';
import { ObservabilityModule, ReliabilityModule } from './infrastructure';
import { GetRolesCapabilitiesQueryRepository } from './roles/persistence/get-roles-capabilities.query-repository';
import { RolesModule } from './roles/roles.module';
import { CaslUserContextResolver } from './users/services/casl-user-context.resolver';
import { UsersModule } from './users/users.module';

/**
 * Root composition module of the Users API application.
 *
 * Orchestrates cross-cutting infrastructure concerns (Observability, Reliability, Persistence,
 * CASL Authorization, CQRS) alongside business domain modules (Users, Roles, Auths).
 *
 * CASL principal resolution is an application service (`CaslUserContextResolver`);
 * persistence lookup remains behind `GetUserContextQuery` and its repository.
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
