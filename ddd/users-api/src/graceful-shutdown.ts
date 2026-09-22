/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { INestApplicationContext } from '@nestjs/common';

const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/**
 * On SIGTERM or SIGINT, closes the application (Nest shutdown hooks, HTTP
 * server, queue workers, database and cache connections), then runs
 * `afterClose` (telemetry flush), then re-raises the signal so the process
 * terminates with the conventional signal status. A second signal during
 * shutdown terminates immediately.
 *
 * @param app - Application whose shutdown hooks and connections should close.
 * @param afterClose - Cleanup to await after closing the application, such as telemetry flushing.
 *
 * @example Register once during application bootstrap
 * ```ts
 * const app = await NestFactory.create(AppModule);
 * closeOnShutdownSignals(app, shutdownTracing);
 * await app.listen(3000);
 * ```
 */
export function closeOnShutdownSignals(
  app: INestApplicationContext,
  afterClose: () => Promise<void>,
): void {
  const handlers = new Map<NodeJS.Signals, () => void>();
  const release = () => {
    for (const [signal, handler] of handlers) {
      process.removeListener(signal, handler);
    }
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    const handler = () => {
      release();
      void app
        .close()
        .catch((error: unknown) => {
          console.error('Application shutdown failed', error);
        })
        .then(afterClose)
        .catch((error: unknown) => {
          console.error('Telemetry shutdown failed', error);
        })
        .finally(() => process.kill(process.pid, signal));
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
}
