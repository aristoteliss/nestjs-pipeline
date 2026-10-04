/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  Global,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppModule } from './app.module.js';
import { shutdownTracing } from './tracing.js';

/** Flushes pending telemetry and stops the OpenTelemetry SDK on shutdown. */
@Injectable()
export class TracingShutdown implements OnApplicationShutdown {
  onApplicationShutdown(): Promise<void> {
    return shutdownTracing();
  }
}

/**
 * Holds the telemetry flush. NestJS runs the lifecycle hooks of global modules
 * first on startup and last on shutdown, and among them shuts the first
 * registered down last; `ServerModule` imports this one before `AppModule`, so
 * the flush runs after the HTTP server, queue workers, database and cache have
 * closed.
 */
@Global()
@Module({ providers: [TracingShutdown] })
export class TracingModule {}

/**
 * Root module of the running server: `AppModule` plus the telemetry flush.
 *
 * @example
 * ```ts
 * const app = await NestFactory.create(ServerModule);
 * app.enableShutdownHooks();
 * await app.listen(3000);
 * ```
 */
@Module({ imports: [TracingModule, AppModule] })
export class ServerModule {}
