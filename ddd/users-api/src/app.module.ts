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

import { BullModule } from '@nestjs/bullmq';
import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
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
  TRACE_BEHAVIOR_LOGGER,
  TraceBehavior,
} from '@nestjs-pipeline/opentelemetry';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';
import { Logger, LoggerModule } from 'nestjs-pino';
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
       * - TraceBehavior creates OTel spans (and uses nestjs-pino via TRACE_BEHAVIOR_LOGGER)
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
    }),
    UsersModule,
  ],
  providers: [
    { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: Logger },
    { provide: TRACE_BEHAVIOR_LOGGER, useExisting: Logger },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}
