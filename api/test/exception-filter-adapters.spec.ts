/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RateLimitExceededError } from '@cqrs-ddd/pipeline-rate-limit';
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import {
  Controller,
  Get,
  type INestApplication,
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PipelineErrorFilter } from '../src/common/filters/pipeline-error.filter.js';

function validationError(): ZodValidationError {
  const result = z.object({ name: z.string() }).safeParse({});
  if (result.success) throw new Error('Expected parse to fail');
  return new ZodValidationError(result.error);
}

@Controller()
class ProbeController {
  @Get('limited')
  limited(): never {
    throw new RateLimitExceededError({
      key: 'probe',
      requestName: 'ProbeCommand',
      msBeforeNext: 2500,
      remainingPoints: 0,
      limit: 1,
    });
  }

  @Get('middleware')
  middleware(): string {
    return 'unreachable';
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(() => {
        throw validationError();
      })
      .forRoutes('middleware');
  }
}

describe.each(['express', 'fastify'] as const)(
  'PipelineErrorFilter on %s',
  (adapter) => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [ProbeModule],
        providers: [{ provide: APP_FILTER, useClass: PipelineErrorFilter }],
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

    afterAll(async () => {
      await app.close();
    });

    it('answers a package error thrown in Nest middleware', async () => {
      const response = await request(app.getHttpServer()).get('/middleware');

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        details: { fieldErrors: { name: expect.any(Array) } },
      });
    });

    it('sets Retry-After in whole seconds on a rate-limited answer', async () => {
      const response = await request(app.getHttpServer()).get('/limited');

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBe('3');
      expect(response.body).toMatchObject({ statusCode: 429, retryAfter: 3 });
    });
  },
);
