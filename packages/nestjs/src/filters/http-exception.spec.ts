/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  ConcurrencyConflictError,
  EntityNotFoundException,
} from '@cqrs-ddd/core/domain';
import { UnauthorizedActionException } from '@cqrs-ddd/pipeline-casl';
import { FeatureDisabledError } from '@cqrs-ddd/pipeline-feature-flags';
import { IdempotencyConflictError } from '@cqrs-ddd/pipeline-idempotency';
import { RateLimitExceededError } from '@cqrs-ddd/pipeline-rate-limit';
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { BadRequestException, HttpException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  httpAnswer,
  toHttpException,
  validationMessages,
} from './http-exception.js';

function validationError(): ZodValidationError {
  const result = z
    .object({ email: z.email(), name: z.string() })
    .refine(() => false, 'Not accepted')
    .safeParse({ email: 'x' });
  if (result.success) throw new Error('Expected the parse to fail');
  return new ZodValidationError(result.error);
}

describe('validationMessages', () => {
  it('lists form errors as they are and field errors as field: message', () => {
    expect(
      validationMessages({
        formErrors: ['Not accepted'],
        fieldErrors: { email: ['Invalid email'], name: undefined },
      }),
    ).toEqual(['Not accepted', 'email: Invalid email']);
  });
});

describe('httpAnswer', () => {
  it('answers a ZodValidationError with the BadRequestException of the validation pipe', () => {
    const answer = httpAnswer(validationError());

    expect(answer?.exception).toBeInstanceOf(BadRequestException);
    expect(answer?.exception.getResponse()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: [
        expect.stringMatching(/^email: /),
        expect.stringMatching(/^name: /),
      ],
    });
    expect(answer?.headers).toEqual({});
  });

  it('answers a denied action with 403 and the action and subject', () => {
    const answer = httpAnswer(
      new UnauthorizedActionException({ action: 'create', subject: 'User' }),
    );

    expect(answer?.exception.getStatus()).toBe(403);
    expect(answer?.exception.getResponse()).toMatchObject({
      statusCode: 403,
      error: 'Forbidden',
      action: 'create',
      subject: 'User',
    });
  });

  it('answers a disabled feature with 403 and the flag', () => {
    const answer = httpAnswer(new FeatureDisabledError('beta', 'CreateThing'));

    expect(answer?.exception.getStatus()).toBe(403);
    expect(answer?.exception.getResponse()).toMatchObject({ flag: 'beta' });
  });

  it('answers an exceeded rate limit with 429 and a Retry-After header', () => {
    const answer = httpAnswer(
      new RateLimitExceededError({
        key: 'k',
        requestName: 'CreateThing',
        msBeforeNext: 2500,
        remainingPoints: 0,
        limit: 1,
      }),
    );

    expect(answer?.exception.getStatus()).toBe(429);
    expect(answer?.exception.getResponse()).toMatchObject({
      statusCode: 429,
      retryAfter: 3,
    });
    expect(answer?.headers).toEqual({ 'Retry-After': '3' });
  });

  it('answers an idempotency conflict with its status and reason', () => {
    const answer = httpAnswer(
      new IdempotencyConflictError({
        key: 'key-1',
        requestName: 'CreateThing',
        reason: 'key_reuse',
      }),
    );

    expect(answer?.exception.getStatus()).toBe(422);
    expect(answer?.exception.getResponse()).toMatchObject({
      reason: 'key_reuse',
    });
  });

  it('answers a core domain error with its domain status', () => {
    expect(
      httpAnswer(
        new EntityNotFoundException('User', 'u-1'),
      )?.exception.getResponse(),
    ).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'User not found',
    });
    expect(
      httpAnswer(
        new ConcurrencyConflictError('User', 'u-1', 1),
      )?.exception.getStatus(),
    ).toBe(409);
  });

  it('leaves any other error alone', () => {
    expect(httpAnswer(new Error('boom'))).toBeUndefined();
    expect(httpAnswer('boom')).toBeUndefined();
  });
});

describe('toHttpException', () => {
  it('gives the exception of the answer, or undefined', () => {
    expect(
      toHttpException(new EntityNotFoundException('User', 'u-1')),
    ).toBeInstanceOf(HttpException);
    expect(toHttpException(new Error('boom'))).toBeUndefined();
  });
});

describe('optional behavior packages', () => {
  afterEach(() => {
    vi.doUnmock('node:module');
    vi.resetModules();
  });

  it('converts nothing for a package that is not installed, or lacks its error class or HTTP mapping', async () => {
    vi.resetModules();
    vi.doMock('node:module', async (original) => {
      const actual = await original<typeof import('node:module')>();
      const fakes: Record<string, unknown> = {
        '@cqrs-ddd/pipeline-casl': { UnauthorizedActionException: undefined },
        '@cqrs-ddd/pipeline-feature-flags/http': { toHttpResponse: undefined },
      };
      return {
        ...actual,
        createRequire: (from: string) => {
          const require = actual.createRequire(from);
          return Object.assign((name: string) => fakes[name] ?? require(name), {
            resolve: (name: string) => {
              if (name.startsWith('@cqrs-ddd/pipeline-zod')) {
                throw new Error(`Cannot find module '${name}'`);
              }
              return name;
            },
          });
        },
      };
    });
    const { httpAnswer: answer } = await import('./http-exception.js');

    expect(answer(validationError())).toBeUndefined();
    expect(
      answer(
        new UnauthorizedActionException({ action: 'read', subject: 'User' }),
      ),
    ).toBeUndefined();
    expect(
      answer(new FeatureDisabledError('beta', 'CreateThing')),
    ).toBeUndefined();
    expect(
      answer(new EntityNotFoundException('User', 'u-1'))?.exception.getStatus(),
    ).toBe(404);
  });
});
