/* Copyright (C) 2026-present Aristotelis — see repository license. */

import './tracing'; // Must initialize before NestJS and AppModule load.
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { UnauthorizedActionFilter } from '@nestjs-pipeline/casl';
import { FeatureDisabledFilter } from '@nestjs-pipeline/feature-flags';
import { IdempotencyConflictFilter } from '@nestjs-pipeline/idempotency';
import { RateLimitExceededFilter } from '@nestjs-pipeline/rate-limit';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';
import { NativeLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { configureExpress } from './express-platform';
import { closeOnShutdownSignals } from './graceful-shutdown';
import { createFastifyAdapter, registerSecureSession } from './http-platform';
import { shutdownTracing } from './tracing';

export async function bootstrap(): Promise<void> {
  const useFastify = process.env.ADAPTER === 'fastify';

  const app = useFastify
    ? await NestFactory.create<NestFastifyApplication>(
        AppModule,
        createFastifyAdapter(),
        { bufferLogs: true },
      )
    : await NestFactory.create<NestExpressApplication>(AppModule, {
        bufferLogs: true,
      });

  if (useFastify) {
    if (!process.env.SESSION_SECRET) {
      throw new Error('SESSION_SECRET must be set for secure sessions');
    }
    await registerSecureSession(
      app as NestFastifyApplication,
      process.env.SESSION_SECRET,
    );
  } else {
    configureExpress(app as NestExpressApplication);
  }

  app.useLogger(app.get(NativeLogger));
  app.useGlobalFilters(
    new ZodValidationFilter(),
    new FeatureDisabledFilter(),
    new RateLimitExceededFilter(),
    new IdempotencyConflictFilter(),
    new UnauthorizedActionFilter(),
    new DomainExceptionFilter(),
  );

  closeOnShutdownSignals(app, shutdownTracing);

  await app.listen(3000, '0.0.0.0');
  console.log(
    `Users API running on http://localhost:3000 (adapter: ${useFastify ? 'fastify' : 'express'})`,
  );
}
