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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
 */

import { IncomingMessage } from 'node:http';
import { AuthSessionInterceptor } from '@common/interceptors/auth-session.interceptor';
import { BullModule } from '@nestjs/bullmq';
import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { CaslModule } from '@nestjs-pipeline/casl';
import {
  LOGGING_BEHAVIOR_LOGGER,
  LoggingBehavior,
  PipelineModule,
} from '@nestjs-pipeline/core';
import {
  getCorrelationId,
  HttpCorrelationMiddleware,
  runWithCorrelationId,
} from '@nestjs-pipeline/correlation';
import {
  TraceBehavior,
} from '@nestjs-pipeline/opentelemetry';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';
import { PersistenceModule } from '@persistence/persistence.module';
import { LoggerModule, NativeLogger } from 'nestjs-pino';
import { AuthsModule } from './auths/auths.module';
import { GetUserCapabilitiesQueryRepository } from './auths/repositories/get-user-capabilities.query-repository';
import { GetRolesCapabilitiesQueryRepository } from './roles/persistence/get-roles-capabilities.query-repository';
import { RolesModule } from './roles/roles.module';
import { GetUserContextQueryRepository } from './users/persistence/get-user-context.query-repository';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                //singleLine: true,
                messageFormat: '[{context}] {msg}',
                //ignore: 'pid,hostname,context,req,res,responseTime',
                translateTime: 'SYS:HH:MM:ss.l',
              },
            }
            : undefined,
        customProps: (req: IncomingMessage) => ({
          context: `${req.method} ${req.url}`,
        }),
      },
    }),
    CqrsModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    PipelineModule.forRoot({
      /**
       * Bridge correlation IDs from @nestjs-pipeline/correlation into the pipeline.
       * getCorrelationId() reads from HTTP middleware, @WithCorrelation, or runWithCorrelationId.
       */
      correlationIdFactory: getCorrelationId,
      correlationIdRunner: runWithCorrelationId,
      /**
       * Register global behaviors once so all commands, queries, and events share
       * the same logging/tracing/validation pipeline without per-handler decorators.
       *
       * before: LoggingBehavior
       * - emits request/response + timing logs
       * - uses nestjs-pino through LOGGING_BEHAVIOR_LOGGER provider
       *
       * after: TraceBehavior + ZodValidationBehavior
       * - TraceBehavior creates OTel spans (and uses nestjs-pino via LOGGING_BEHAVIOR_LOGGER)
       * - ZodValidationBehavior validates static _zodSchema when present
       */
      globalBehaviors: {
        scope: 'all',
        before: [LoggingBehavior],
        after: [
          [TraceBehavior, { tracerName: 'users-api' }],
          ZodValidationBehavior,
        ],
      },
      loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: NativeLogger }
    }),
    CaslModule.forRoot({
      roleProvider: GetRolesCapabilitiesQueryRepository,
      userContextResolver: GetUserContextQueryRepository,
      userCapabilityProvider: GetUserCapabilitiesQueryRepository,
      subjectContextPaths: ['sessionUser'],
      defaultFieldsFromRequest: {
        User: ['username', 'department', 'email'],
      },
    }),
    UsersModule,
    RolesModule,
    AuthsModule,
    PersistenceModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: AuthSessionInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}

