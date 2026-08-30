/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { performance } from 'node:perf_hooks';
import {
  Inject,
  Injectable,
  Logger,
  LoggerService,
  LogLevel,
  Optional,
} from '@nestjs/common';
import { safeSanitize, safeStringify } from '../helpers/safeStringify';
import {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import { IPipelineContext } from '../interfaces/pipeline.context.interface';

/**
 * Injection token for providing a custom {@link LoggerService} to {@link LoggingBehavior}.
 *
 * The behavior dispatches through NestJS {@link LoggerService} method names
 * (`log`, `debug`, `verbose`, `warn`, `error`, `fatal`) according to the
 * configured {@link LogLevel}. A custom logger therefore needs to expose those
 * Nest-compatible methods (directly or through an adapter such as nestjs-pino's
 * Nest logger integration).
 *
 * @example
 * ```ts
 * // In your module providers:
 * { provide: LOGGING_BEHAVIOR_LOGGER, useValue: myPinoLogger }
 * ```
 */
export const LOGGING_BEHAVIOR_LOGGER = Symbol('LOGGING_BEHAVIOR_LOGGER');

// Type definition accepting any error class
type ErrorClass = abstract new (...args: never[]) => Error;

/**
 * Configuration options for the logging behavior.
 *
 * Levels use NestJS {@link LogLevel} names (`'verbose'`, `'debug'`, `'log'`,
 * `'warn'`, `'error'`, `'fatal'`).
 * When using `nestjs-pino`, these map to pino levels:
 * `'verbose'` → `trace`, `'debug'` → `debug`, `'log'` → `info`, `'warn'` → `warn`,
 * `'error'` → `error`, `'fatal'` → `fatal`.
 * Use `'none'` to suppress a message entirely.
 */
export interface LoggingBehaviorOptions {
  /**
   * Log level for the post-success metric line (correlation ID, request
   * kind/name, handler name, and elapsed duration in ms). Emitted once
   * `next()` resolves without throwing.
   * Uses NestJS LogLevel names or 'none' to suppress.
   * Default: 'log'.
   */
  metricLogLevel?: LogLevel | 'none';

  /**
   * Log level used when the wrapped handler throws.
   * Uses NestJS LogLevel names or 'none' to suppress.
   * Overridden per error type when `mapLogLevel` has a matching entry.
   * Default: 'error'.
   */
  errorLogLevel?: LogLevel | 'none';

  /**
   * Per-exception-type log level override, keyed by error class.
   *
   * When the thrown error is an `instanceof` more than one registered key,
   * the most specific (most derived) matching class wins — e.g. with both
   * `Error` and `ForbiddenException` registered, a thrown `ForbiddenException`
   * logs at the `ForbiddenException` level, regardless of the order the
   * entries were inserted into the Map. Falls back to `errorLogLevel` when
   * no key matches.
   * Example: `new Map([[Error, 'error'], [ForbiddenException, 'warn']])`
   */
  mapLogLevel?: Map<ErrorClass, LogLevel | 'none'>;

  /**
   * Log level for request/response payloads.
   * Uses NestJS LogLevel names or 'none' to suppress.
   * Default: 'debug'.
   */
  requestResponseLogLevel?: LogLevel | 'none';

  /**
   * Keys to exclude from request/response logs.
   * Passed to `safeStringify`/`safeSanitize` as a `Set<string>` for filtering object properties.
   * Supports dot notation for nested properties (e.g. `'ctx.sessionUser'`).
   * Example: `['password', 'token', 'ctx.sessionUser']` omits those fields from the log output.
   * Default: [] (no keys excluded).
   */
  excludeKeys?: string[];

  /**
   * If true, omits the request payload from logs entirely, logging the
   * placeholder `'[exclude request obj]'` instead.
   * Default: true.
   */
  excludeRequestObj?: boolean;

  /**
   * If true, omits the response payload from logs entirely, logging the
   * placeholder `'[exclude response obj]'` instead.
   * Default: true.
   */
  excludeResponseObj?: boolean;

  /**
   * Output shape for request/response/metric/error logs.
   * - 'text': single interpolated string (default).
   * - 'structured': plain object payload (e.g. `{ msg, request }` for
   *   request/response, or `{ message, stack, ... }` for errors), suitable
   *   for structured loggers like nestjs-pino/pino that serialize objects
   *   into JSON fields.
   * Default: 'text'.
   */
  logFormat?: 'text' | 'structured';
}

/**
 * Structural type for errors/exceptions that carry extra, loggable context
 * via an `optionalParams` property, in addition to the standard `message`
 * and `stack`. When a thrown error matches this shape (checked via
 * {@link LoggingBehavior.hasOptionalParams}), `handle` appends
 * `optionalParams` to the error log entry — see {@link LoggingBehavior.handle}.
 */
interface ErrorWithOptionalParams {
  optionalParams?: unknown;
}

/**
 * Pipeline behavior that logs each request/response and execution timing.
 *
 * Emits the incoming request, a completion metric (duration), and the response,
 * each at a configurable log level (see `LoggingBehaviorOptions`). Request and
 * response payloads are excluded by default and can be opted in, with key-based
 * redaction. If the wrapped handler throws, the error is logged — including its
 * stack trace and, when present, the error's `optionalParams` (see
 * {@link ErrorWithOptionalParams}) — and then re-thrown unchanged. Uses the
 * logger bound to `LOGGING_BEHAVIOR_LOGGER` (e.g. nestjs-pino) when provided,
 * otherwise falls back to the Nest `Logger`.
 */
@Injectable()
export class LoggingBehavior implements IPipelineBehavior {
  private readonly logger: LoggerService;

  constructor(
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    logger?: LoggerService,
  ) {
    this.logger = logger ?? new Logger(LoggingBehavior.name);
  }

  /**
   * Wraps the next handler/behavior in the pipeline with request/response
   * logging, a duration metric, and error logging.
   *
   * Resolves options via `context.getBehaviorOptions(LoggingBehavior)`
   * (falling back to the defaults documented on {@link LoggingBehaviorOptions})
   * and then, in order:
   *
   * 1. Logs the incoming request — or the `'[exclude request obj]'`
   *    placeholder when `excludeRequestObj` is true — at `requestResponseLogLevel`.
   * 2. Invokes `next()` and awaits the result.
   * 3. **On success:** logs a metric line (correlation ID, request kind/name,
   *    handler name, elapsed time in ms) at `metricLogLevel`, then logs the
   *    response — or the `'[exclude response obj]'` placeholder when
   *    `excludeResponseObj` is true — at `requestResponseLogLevel`, and
   *    returns the result.
   * 4. **On failure:** logs an error line containing the correlation ID,
   *    request kind/name, handler name, elapsed time, and the error's
   *    name/message. Two things are appended to that log entry when available:
   *    - the error's `stack`, if it's an `Error` instance;
   *    - the error's `optionalParams`, if it defines one (see
   *      {@link ErrorWithOptionalParams} / {@link hasOptionalParams}) — the
   *      value is normalized into an array via {@link extractOptionalParams}
   *      (wrapped in a single-element array if it isn't already an array)
   *      and merged into the logged payload, so any extra context an
   *      exception carries beyond `message`/`stack` still reaches the logs.
   *
   *    The level used for this line is `errorLogLevel` by default, unless
   *    `mapLogLevel` has an entry matching the error's type — in which case
   *    the most specific matching class wins. The original error is then
   *    re-thrown unchanged, so this behavior only observes failures, never
   *    swallows them.
   *
   * Any line is skipped entirely when its resolved level is `'none'`, and
   * every line's shape — an interpolated string vs. a structured object —
   * depends on `logFormat`.
   *
   * @param context - The pipeline context for the current request: exposes
   *   `handlerName`, `correlationId`, `requestKind`, `requestName`, `request`,
   *   and the per-behavior options via `getBehaviorOptions`.
   * @param next - Delegate that invokes the next behavior/handler in the chain.
   * @returns The value resolved by `next()`.
   * @throws Re-throws whatever `next()` throws, after logging it.
   */
  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options =
      context.getBehaviorOptions<LoggingBehaviorOptions>(LoggingBehavior);
    const metricLogLevel = options?.metricLogLevel ?? 'log';
    const requestResponseLogLevel = options?.requestResponseLogLevel ?? 'debug';
    const errorLogLevel = options?.errorLogLevel ?? 'error';
    const excludeKeys = options?.excludeKeys
      ? new Set<string>(options.excludeKeys)
      : new Set<string>();
    const excludeRequestObj = options?.excludeRequestObj ?? true;
    const excludeResponseObj = options?.excludeResponseObj ?? true;
    const logFormat = options?.logFormat ?? 'text';
    const structured = logFormat === 'structured';

    const requestPayload = excludeRequestObj
      ? '[exclude request obj]'
      : structured
        ? safeSanitize(context.request, excludeKeys)
        : safeStringify(context.request, excludeKeys);

    this.log(
      requestResponseLogLevel,
      structured
        ? { msg: `Request → ${context.handlerName}`, request: requestPayload }
        : `Request: ${requestPayload}`,
      context.handlerName,
    );

    const startTime = performance.now();

    try {
      const result = await next();
      const duration = (performance.now() - startTime).toFixed(2);

      const metricMsg =
        `[${context.correlationId}] ${context.requestKind.toUpperCase()} ` +
        `${context.requestName} → ${context.handlerName} completed in ${duration}ms`;

      this.log(
        metricLogLevel,
        structured
          ? {
              msg: metricMsg,
              correlationId: context.correlationId,
              requestKind: context.requestKind,
              requestName: context.requestName,
              handlerName: context.handlerName,
              durationMs: Number(duration),
            }
          : metricMsg,
        context.handlerName,
      );

      const responsePayload = excludeResponseObj
        ? '[exclude response obj]'
        : result != null
          ? structured
            ? safeSanitize(result, excludeKeys)
            : safeStringify(result, excludeKeys)
          : '(void)';

      this.log(
        requestResponseLogLevel,
        structured
          ? {
              msg: `Response ← ${context.handlerName}`,
              response: responsePayload,
            }
          : `Response: ${responsePayload}`,
        context.handlerName,
      );

      return result;
    } catch (error) {
      const duration = (performance.now() - startTime).toFixed(2);
      const err = error instanceof Error ? error : undefined;
      let logLevel = errorLogLevel;

      if (options?.mapLogLevel) {
        let bestMatch: ErrorClass | undefined;
        for (const [errorType, level] of options.mapLogLevel.entries()) {
          if (!(error instanceof errorType)) continue;
          if (!bestMatch || errorType.prototype instanceof bestMatch) {
            bestMatch = errorType;
            logLevel = level;
          }
        }
      }

      const message =
        `[${context.correlationId}] ${context.requestKind.toUpperCase()} ` +
        `${context.requestName} → ${context.handlerName} failed after ${duration}ms: ` +
        `${err ? `${err.name}: ${err.message}` : String(error)}`;

      if (structured) {
        const payload: Record<string, unknown> = {
          message,
          ...(err?.stack ? { stack: err.stack } : {}),
          ...(this.hasOptionalParams(error)
            ? { optionalParams: this.extractOptionalParams(error) }
            : {}),
        };
        this.log(logLevel, payload, context.handlerName);
      } else {
        const optionalParams: unknown[] = [
          ...(err?.stack ? [err.stack] : []),
          ...(this.hasOptionalParams(error)
            ? this.extractOptionalParams(error)
            : []),
          context.handlerName,
        ];
        this.log(logLevel, message, ...optionalParams);
      }

      throw error;
    }
  }

  /**
   * Dispatches `message` (and any `optionalParams`) to the logger method
   * matching `level` — e.g. `level: 'warn'` calls `this.logger.warn(...)`.
   * No-op when `level` is `'none'` or the underlying logger doesn't
   * implement that method.
   */
  private log(
    level: LogLevel | 'none',
    message: unknown,
    ...optionalParams: unknown[]
  ): void {
    if (level === 'none') return;

    const method = this.logger[level as keyof LoggerService];
    if (typeof method === 'function') {
      (
        method as (message: unknown, ...optionalParams: unknown[]) => unknown
      ).call(this.logger, message, ...optionalParams);
    }
  }

  /**
   * Type guard: true when `error` is a non-null object exposing a defined
   * `optionalParams` property, i.e. it matches {@link ErrorWithOptionalParams}.
   * `handle`'s `catch` branch uses this to decide whether the error log
   * should be enriched with that extra context.
   */
  private hasOptionalParams(error: unknown): error is ErrorWithOptionalParams {
    return (
      typeof error === 'object' &&
      error !== null &&
      'optionalParams' in error &&
      error.optionalParams !== undefined
    );
  }

  /**
   * Normalizes `error.optionalParams` into an array so it can be spread into
   * the error log payload: passed through as-is if it's already an array,
   * or wrapped in a single-element array otherwise. Always returns an array —
   * callers only reach this after {@link hasOptionalParams} has confirmed
   * `optionalParams` is defined, so there's no `null`/`undefined` case here.
   */
  private extractOptionalParams(error: ErrorWithOptionalParams): unknown[] {
    return Array.isArray(error.optionalParams)
      ? error.optionalParams
      : [error.optionalParams];
  }
}
