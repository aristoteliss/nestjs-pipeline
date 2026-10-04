/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createRequire } from 'node:module';
import { ObservabilityModule } from '@common/modules/index.js';
import {
  Controller,
  Get,
  type INestApplication,
  Module,
  Param,
} from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { SpanKind } from '@opentelemetry/api';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

@Controller('probes')
class ProbeController {
  @Get(':id')
  find(@Param('id') id: string): { id: string } {
    return { id };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

const exporter = new tracing.InMemorySpanExporter();
const sdk = new NodeSDK({
  resourceDetectors: [],
  spanProcessors: [new tracing.SimpleSpanProcessor(exporter)],
  instrumentations: [new HttpInstrumentation()],
});

const serverSpans = () =>
  exporter.getFinishedSpans().filter((span) => span.kind === SpanKind.SERVER);

beforeAll(() => {
  sdk.start();
  // The instrumentation patches `http` on its next `require`; the test runner
  // and the adapters loaded it before the SDK started.
  createRequire(import.meta.url)('node:http');
});

afterAll(() => sdk.shutdown());

describe.each(['express', 'fastify'] as const)(
  'HTTP server spans on %s',
  (adapter) => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [CqrsModule.forRoot(), ObservabilityModule, ProbeModule],
      }).compile();
      app =
        adapter === 'fastify'
          ? moduleRef.createNestApplication<NestFastifyApplication>(
              new FastifyAdapter(),
              { logger: false },
            )
          : moduleRef.createNestApplication({ logger: false });
      await app.init();
      if (adapter === 'fastify') {
        await (app as NestFastifyApplication)
          .getHttpAdapter()
          .getInstance()
          .ready();
      }
    });

    afterAll(() => app.close());

    beforeEach(() => {
      exporter.reset();
    });

    it('names a matched route by its template and sets http.route', async () => {
      await request(app.getHttpServer()).get('/probes/42').expect(200);

      const [span] = serverSpans();
      expect(span?.name).toBe('GET /probes/:id');
      expect(span?.attributes['http.route']).toBe('/probes/:id');
    });
  },
);
