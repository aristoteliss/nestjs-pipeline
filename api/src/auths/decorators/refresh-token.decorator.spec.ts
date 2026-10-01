/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { randomBytes } from 'node:crypto';
import { Controller, HttpCode, Post } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainExceptionFilter } from '../../common/filters/domain-exception.filter.js';
import {
  createFastifyAdapter,
  registerSecureSession,
} from '../../http-platform.js';
import type { RefreshTokenDto } from '../dtos/refresh-token.dto.js';
import { RefreshToken } from './refresh-token.decorator.js';

@Controller()
class RefreshTokenProbe {
  @Post('required')
  @HttpCode(200)
  required(@RefreshToken() refreshToken: RefreshTokenDto) {
    return { refreshToken };
  }

  @Post('optional')
  @HttpCode(200)
  optional(
    @RefreshToken({ optional: true }) refreshToken: RefreshTokenDto | undefined,
  ) {
    return { refreshToken: refreshToken ?? null };
  }
}

describe('RefreshToken', () => {
  let app: NestFastifyApplication;

  const post = (url: string, cookie?: string) =>
    app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: 'POST', url, headers: cookie ? { cookie } : {} });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RefreshTokenProbe],
      providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter(),
      { logger: false },
    );
    await registerSecureSession(app, randomBytes(32).toString('hex'));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('injects the refresh_token cookie', async () => {
    const response = await post('/required', 'refresh_token=token-1');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ refreshToken: 'token-1' });
  });

  it('answers a missing or empty cookie with 401 refresh_invalid', async () => {
    for (const cookie of [undefined, 'refresh_token=']) {
      const response = await post('/required', cookie);

      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('refresh_invalid');
    }
  });

  it('injects undefined for a missing or empty cookie when optional', async () => {
    for (const cookie of [undefined, 'refresh_token=']) {
      const response = await post('/optional', cookie);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ refreshToken: null });
    }
  });
});
