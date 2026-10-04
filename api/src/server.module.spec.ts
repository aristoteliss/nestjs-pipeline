/* Copyright (C) 2026-present Aristotelis — see repository license. */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

const order = vi.hoisted((): string[] => []);

vi.mock('./tracing.js', () => ({
  shutdownTracing: vi.fn(async () => {
    order.push('flush');
  }),
}));

vi.mock('./app.module.js', async () => {
  const { Global, Injectable, Module } = await import('@nestjs/common');

  @Injectable()
  class QueueWorkers {
    async onApplicationShutdown(): Promise<void> {
      order.push('workers');
    }
  }

  @Injectable()
  class LoggerConnection {
    async onApplicationShutdown(): Promise<void> {
      order.push('global');
    }
  }

  @Global()
  @Module({ providers: [LoggerConnection] })
  class LoggerModule {}

  @Module({ providers: [QueueWorkers] })
  class FeatureModule {}

  @Module({ imports: [LoggerModule, FeatureModule] })
  class AppModule {}

  return { AppModule };
});

const { ServerModule } = await import('./server.module.js');

describe('ServerModule', () => {
  it("flushes telemetry after every shutdown hook of AppModule's modules, global ones included", async () => {
    const app = await NestFactory.createApplicationContext(ServerModule, {
      logger: false,
    });

    await app.close();

    expect(order).toEqual(['workers', 'global', 'flush']);
  });
});
