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
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { BullModule } from '@nestjs/bullmq';
import { LoggingBehavior, PipelineModule } from '@nestjs-pipeline/core';
import { getCorrelationId, HttpCorrelationMiddleware, runWithCorrelationId } from '@nestjs-pipeline/correlation';
import { UsersModule } from './users/users.module';
import { TraceBehavior } from '@nestjs-pipeline/opentelemetry';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';

@Module({
  imports: [
    CqrsModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env['REDIS_HOST'] ?? 'localhost',
        port: Number(process.env['REDIS_PORT'] ?? 6379),
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
       * Register LoggingBehavior globally so every command query and event automatically gets logging.
       * ZodValidationBehavior runs before the handler and validates the request against the
       * ZOD_SCHEMA static property when present (attached by createRequest / createEvent helpers).
       * TraceBehavior is registered globally as an "after" behavior to ensure it wraps the entire request lifecycle,
       * automatically gets pipeline wrapping — no per-handler decoration needed.
       */
      globalBehaviors: {
        scope: 'all',
        before: [LoggingBehavior],
        after: [[TraceBehavior, { tracerName: 'users-api' }], ZodValidationBehavior],
      },
    }),
    UsersModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}
