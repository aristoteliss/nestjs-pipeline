import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { LoggingBehavior, PipelineModule } from '@nestjs-pipeline/core';
import { UsersModule } from './users/users.module';
import { TraceBehavior } from '@nestjs-pipeline/opentelemetry';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      /**
       * Register LoggingBehavior globally so every command query and event automatically gets logging.
       * ZodValidationBehavior runs before the handler and validates the request against the
       * ZOD_SCHEMA static property when present (attached by createRequest / createEvent helpers).
       * TraceBehavior is registered globally as an "after" behavior to ensure it wraps the entire request lifecycle,
       * automatically gets pipeline wrapping — no per-handler decoration needed.
       */
      globalBehaviors: {
        scope: 'all',
        before: [LoggingBehavior, ZodValidationBehavior],
        after: [[TraceBehavior, { tracerName: 'users-api' }]],
      },
    }),
    UsersModule,
  ],
})
export class AppModule { }
