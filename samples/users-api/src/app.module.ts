import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { LoggingBehavior, PipelineModule } from '@nestjs-pipeline/core';
import { UsersModule } from './users/users.module';
import { TraceBehavior } from '@nestjs-pipeline/opentelemetry';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      /**
       * Register LoggingBehavior globally so every command query and event automatically gets logging.
       * TraceBehavior is registered globally as an "after" behavior to ensure it wraps the entire request lifecycle,
       * automatically gets pipeline wrapping — no per-handler decoration needed.
       */
      globalBehaviors: {
        scope: 'all',
        before: [LoggingBehavior],
        after: [[TraceBehavior, { tracerName: 'users-api' }]],
      },
    }),
    UsersModule,
  ],
})
export class AppModule { }
