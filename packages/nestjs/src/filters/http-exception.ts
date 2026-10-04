/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createRequire } from 'node:module';
import { domainErrorHttpStatus } from '@cqrs-ddd/core/http';
import { BadRequestException, HttpException } from '@nestjs/common';

/** A NestJS exception for a package error, and the headers its answer carries. */
export interface HttpAnswer {
  readonly exception: HttpException;
  readonly headers: Readonly<Record<string, string>>;
}

/** The flattened issues a `ZodValidationError` carries in `details`. */
export interface ValidationDetails {
  readonly formErrors: readonly string[];
  readonly fieldErrors: Readonly<Record<string, readonly string[] | undefined>>;
}

interface HttpResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly headers: Record<string, string>;
}

type ErrorClass = abstract new (...args: never[]) => Error;
type Convert = (error: unknown) => HttpAnswer | undefined;

/**
 * The validation messages of NestJS's `StandardSchemaValidationPipe` for
 * flattened Zod issues: a form error as it is, a field error as
 * `field: message`.
 *
 * @example
 * ```ts
 * validationMessages({ formErrors: [], fieldErrors: { email: ['Invalid email'] } });
 * // ['email: Invalid email']
 * ```
 */
export function validationMessages(details: ValidationDetails): string[] {
  return [
    ...details.formErrors,
    ...Object.entries(details.fieldErrors).flatMap(([field, messages]) =>
      (messages ?? []).map((message) => `${field}: ${message}`),
    ),
  ];
}

const require = createRequire(import.meta.url);

function installed(name: string): boolean {
  try {
    require.resolve(name);
    return true;
  } catch {
    return false;
  }
}

function optional(name: string): Record<string, unknown> | undefined {
  return installed(name)
    ? (require(name) as Record<string, unknown>)
    : undefined;
}

function packageConverter(
  name: string,
  errorName: string,
): Convert | undefined {
  const errors = optional(name);
  const http = optional(`${name}/http`);
  const type = errors?.[errorName] as ErrorClass | undefined;
  const toHttpResponse = http?.toHttpResponse as
    | ((error: Error) => HttpResponse)
    | undefined;
  if (!type || !toHttpResponse) return undefined;
  return (error) => {
    if (!(error instanceof type)) return undefined;
    const { status, body, headers } = toHttpResponse(error);
    return { exception: new HttpException(body, status), headers };
  };
}

function validationConverter(): Convert | undefined {
  const zod = optional('@cqrs-ddd/pipeline-zod');
  const type = zod?.ZodValidationError as ErrorClass | undefined;
  if (!type) return undefined;
  return (error) =>
    error instanceof type
      ? {
          exception: new BadRequestException(
            validationMessages(
              (error as unknown as { details: ValidationDetails }).details,
            ),
          ),
          headers: {},
        }
      : undefined;
}

const domainConverter: Convert = (error) => {
  const status = domainErrorHttpStatus(error);
  if (!status) return undefined;
  const { statusCode, error: reason, message } = status;
  return {
    exception: new HttpException(
      { statusCode, message, error: reason },
      statusCode,
    ),
    headers: {},
  };
};

// Behavior packages are optional peers: each converts only when installed.
const converters: readonly Convert[] = [
  ...[
    validationConverter(),
    packageConverter('@cqrs-ddd/pipeline-casl', 'UnauthorizedActionException'),
    packageConverter(
      '@cqrs-ddd/pipeline-feature-flags',
      'FeatureDisabledError',
    ),
    packageConverter('@cqrs-ddd/pipeline-rate-limit', 'RateLimitExceededError'),
    packageConverter(
      '@cqrs-ddd/pipeline-idempotency',
      'IdempotencyConflictError',
    ),
  ].filter((convert): convert is Convert => convert !== undefined),
  domainConverter,
];

/**
 * The NestJS exception and headers for an error of a `@cqrs-ddd` package, or
 * `undefined` for any other error. A `ZodValidationError` becomes the
 * `BadRequestException` NestJS's validation pipe throws (`message` lists the
 * issues); a denied action, a disabled feature, an exceeded rate limit and an
 * idempotency conflict take the status, body and headers their package's
 * `toHttpResponse` defines; a `@cqrs-ddd/core` domain error takes
 * `domainErrorHttpStatus`. Every body has NestJS's `statusCode`, `message` and
 * `error`.
 *
 * @example
 * ```ts
 * const answer = httpAnswer(new RateLimitExceededError(details));
 * answer?.exception.getStatus(); // 429
 * answer?.headers; // { 'Retry-After': '3' }
 * ```
 */
export function httpAnswer(error: unknown): HttpAnswer | undefined {
  for (const convert of converters) {
    const answer = convert(error);
    if (answer) return answer;
  }
  return undefined;
}

/**
 * The NestJS `HttpException` for an error of a `@cqrs-ddd` package, or
 * `undefined` for any other error; see {@link httpAnswer}, which also gives the
 * headers.
 *
 * @example
 * ```ts
 * throw toHttpException(error) ?? error;
 * ```
 */
export function toHttpException(error: unknown): HttpException | undefined {
  return httpAnswer(error)?.exception;
}
