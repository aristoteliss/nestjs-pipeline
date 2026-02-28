import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { LoggingBehavior, PipelineModule } from '@nestjs-pipeline/core';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      /**
       * Register LoggingBehavior globally so every command and query
       * automatically gets pipeline wrapping — no per-handler decoration needed.
       */
      globalBehaviors: {
        scope: 'all',
        before: [LoggingBehavior],
      },
    }),
    UsersModule,
  ],
})
export class AppModule {}
