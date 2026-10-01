/* Copyright (C) 2026-present Aristotelis — see repository license. */

import './tracing.js'; // Must initialize before NestJS and AppModule load.
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { NativeLogger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureExpress } from './express-platform.js';
import { closeOnShutdownSignals } from './graceful-shutdown.js';
import {
  createFastifyAdapter,
  registerSecureSession,
} from './http-platform.js';
import { shutdownTracing } from './tracing.js';

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

  closeOnShutdownSignals(app, shutdownTracing);

  await app.listen(3000, '0.0.0.0');
  console.log(
    `Users API running on http://localhost:3000 (adapter: ${useFastify ? 'fastify' : 'express'})`,
  );
}
