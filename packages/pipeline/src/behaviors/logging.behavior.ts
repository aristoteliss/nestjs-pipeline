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
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
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
import { safeStringify } from '../helpers/safeStringify';
import {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import { IPipelineContext } from '../interfaces/pipeline.context.interface';

/**
 * Injection token for providing a custom {@link LoggerService} to {@link LoggingBehavior}.
 *
 * The provided logger must either implement all methods from {@link LoggerService} (log, debug, verbose, warn, error, fatal),
 * or support the NestJS log level mapping (e.g., 'log' → 'info', 'verbose' → 'trace', etc.).
 * If you use a logger like nestjs-pino's Logger, ensure it is compatible or that your pipeline version includes the mapping logic.
 *
 * @example
 * ```ts
 * // In your module providers:
 * { provide: LOGGING_BEHAVIOR_LOGGER, useValue: myPinoLogger }
 * ```
 */
export const LOGGING_BEHAVIOR_LOGGER = Symbol('LOGGING_BEHAVIOR_LOGGER');

/**
 * Configuration options for the logging behavior.
 *
 * Levels use NestJS {@link LogLevel} names (`'verbose'`, `'debug'`, `'log'`, `'warn'`, `'error'`, `'fatal'`).
 * When using `nestjs-pino`, these map to pino levels:
 * `'verbose'` → `trace`, `'debug'` → `debug`, `'log'` → `info`, `'warn'` → `warn`,
 * `'error'` → `error`, `'fatal'` → `fatal`.
 * Use `'none'` to suppress a message entirely.
 */
export interface LoggingBehaviorOptions {
  /**
   * Log level for metrics (duration, completion, etc.).
   * Uses NestJS LogLevel names or 'none' to suppress.
   * Default: 'log'.
   */
  metricLogLevel?: LogLevel | 'none';

  /**
   * Log level for request/response payloads.
   * Uses NestJS LogLevel names or 'none' to suppress.
   * Default: 'debug'.
   */
  requestResponseLogLevel?: LogLevel | 'none';

  /**
   * Keys to exclude from request/response logs.
   * Passed to safeStringify as a Set<string> for filtering object properties.
   * Example: ['password', 'token', ctx.sessionUser ] will omit these fields from log output. support dot for inner properties.
   */
  excludeKeys: string[];
}

interface ContextLogger extends LoggerService {
  setContext(context: string): void;
}

@Injectable()
export class LoggingBehavior implements IPipelineBehavior {
  private readonly logger: LoggerService;
  private readonly hasSetContext: boolean;

  constructor(
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    logger?: LoggerService,
  ) {
    this.logger = logger ?? new Logger(LoggingBehavior.name);
    this.hasSetContext = typeof (this.logger as ContextLogger).setContext === 'function';
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options =
      context.getBehaviorOptions<LoggingBehaviorOptions>(LoggingBehavior);
    const metricLogLevel = options?.metricLogLevel ?? 'log';
    const requestResponseLogLevel = options?.requestResponseLogLevel ?? 'debug';
    const excludeKeys = options?.excludeKeys ? new Set<string>(options.excludeKeys) : new Set<string>();

    if (this.hasSetContext) {
      (this.logger as ContextLogger).setContext(context.handlerName);
    }

    this.log(
      requestResponseLogLevel,
      `Request: ${safeStringify(context.request, excludeKeys)}`,
      context.handlerName,
    );

    const startTime = performance.now();

    try {
      const result = await next();
      const duration = (performance.now() - startTime).toFixed(2);

      this.log(
        metricLogLevel,
        `[${context.correlationId}] ${context.requestKind.toUpperCase()} ` +
        `${context.requestName} → ${context.handlerName} completed in ${duration}ms`,
        context.handlerName,
      );

      this.log(
        requestResponseLogLevel,
        `Response: ${result != null ? safeStringify(result, excludeKeys) : '(void)'}`,
        context.handlerName,
      );

      return result;
    } catch (error) {
      const duration = (performance.now() - startTime).toFixed(2);
      const err = error as Error;
      this.log(
        'error',
        `[${context.correlationId}] ${context.requestKind.toUpperCase()} ` +
        `${context.requestName} → ${context.handlerName} failed after ${duration}ms: ` +
        `${err.name}: ${err.message}`,
        context.handlerName,
      );
      throw error;
    }
  }

  /** Calls the appropriate Logger method, or skips entirely when level is `'none'` or unsupported. */
  private log(level: LogLevel | 'none', message: string, ...optionalParams: unknown[]): void {
    if (level === 'none') return;

    const method = this.logger[level as keyof LoggerService];
    if (typeof method === 'function') {
      (method as (msg: string, ...optionalParams: unknown[]) => void).call(this.logger, message, ...optionalParams);
    }
  }
}
