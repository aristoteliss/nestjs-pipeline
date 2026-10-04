/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { UnauthorizedActionException } from '@cqrs-ddd/pipeline-casl';
import { toHttpResponse as caslAnswer } from '@cqrs-ddd/pipeline-casl/http';
import { FeatureDisabledError } from '@cqrs-ddd/pipeline-feature-flags';
import { toHttpResponse as featureAnswer } from '@cqrs-ddd/pipeline-feature-flags/http';
import { IdempotencyConflictError } from '@cqrs-ddd/pipeline-idempotency';
import { toHttpResponse as idempotencyAnswer } from '@cqrs-ddd/pipeline-idempotency/http';
import { RateLimitExceededError } from '@cqrs-ddd/pipeline-rate-limit';
import { toHttpResponse as rateLimitAnswer } from '@cqrs-ddd/pipeline-rate-limit/http';
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { toHttpResponse as zodAnswer } from '@cqrs-ddd/pipeline-zod/http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Inject,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

type PipelineError =
  | ZodValidationError
  | UnauthorizedActionException
  | FeatureDisabledError
  | RateLimitExceededError
  | IdempotencyConflictError;

function answer(error: PipelineError) {
  if (error instanceof ZodValidationError) return zodAnswer(error);
  if (error instanceof UnauthorizedActionException) return caslAnswer(error);
  if (error instanceof FeatureDisabledError) return featureAnswer(error);
  if (error instanceof RateLimitExceededError) return rateLimitAnswer(error);
  return idempotencyAnswer(error);
}

/**
 * Answers the errors of the pipeline behaviors with the HTTP response each
 * package defines (`toHttpResponse` of its `/http` entry point): 400 for a
 * request that fails its schema, 403 for a denied action or a disabled feature,
 * 429 with `Retry-After` for an exceeded rate limit, 409 or 422 for an
 * idempotency conflict. It replies through Nest's HTTP adapter, so it works on
 * Express and Fastify.
 *
 * @example
 * ```ts
 * @Module({ providers: [{ provide: APP_FILTER, useClass: PipelineErrorFilter }] })
 * export class AppModule {}
 * ```
 */
@Catch(
  ZodValidationError,
  UnauthorizedActionException,
  FeatureDisabledError,
  RateLimitExceededError,
  IdempotencyConflictError,
)
export class PipelineErrorFilter implements ExceptionFilter {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}

  catch(error: PipelineError, host: ArgumentsHost): void {
    const { status, body, headers } = answer(error);
    const { httpAdapter } = this.adapterHost;
    const response = host.switchToHttp().getResponse();
    for (const [name, value] of Object.entries(headers)) {
      httpAdapter.setHeader(response, name, value);
    }
    httpAdapter.reply(response, body, status);
  }
}
