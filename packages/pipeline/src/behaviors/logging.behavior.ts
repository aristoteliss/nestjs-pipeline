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

import { Injectable, Logger, LogLevel } from '@nestjs/common';
import { safeStringify } from '../helpers/safeStringify';
import {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import { IPipelineContext } from '../interfaces/pipeline.context.interface';

/**
 * Configuration options for the logging behavior.
 *
 * @interface LoggingBehaviorOptions
 * @property {(LogLevel | 'none')} [metricLogLevel] - The log level for pipeline timing/completion metrics. Defaults to 'log' if not specified.
 * @property {(LogLevel | 'none')} [requestResponseLogLevel] - The log level for request and response data. Defaults to 'debug' if not specified.
 */
export interface LoggingBehaviorOptions {
  metricLogLevel?: LogLevel | 'none';
  requestResponseLogLevel?: LogLevel | 'none';
}

@Injectable()
export class LoggingBehavior implements IPipelineBehavior {
  private readonly logger = new Logger(LoggingBehavior.name);

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options =
      context.getBehaviorOptions<LoggingBehaviorOptions>(LoggingBehavior);
    const metricLogLevel = options?.metricLogLevel ?? 'log';
    const requestResponseLogLevel = options?.requestResponseLogLevel ?? 'debug';

    this.log(
      requestResponseLogLevel,
      `Request: ${safeStringify(context.request)}`,
    );

    const startTime = performance.now();

    try {
      const result = await next();
      const duration = (performance.now() - startTime).toFixed(2);

      // Event handlers may return void/undefined
      const responseLog =
        result !== undefined ? safeStringify(result) : '(void)';

      this.log(
        metricLogLevel,
        `[${context.correlationId}] ${context.requestKind.toUpperCase()} ` +
          `${context.requestName} → ${context.handlerName} completed in ${duration}ms`,
      );
      this.log(requestResponseLogLevel, `Response: ${responseLog}`);

      return result;
    } catch (error) {
      const duration = (performance.now() - startTime).toFixed(2);
      const err = error as Error;
      this.log(
        'error',
        `[${context.correlationId}] ${context.requestKind.toUpperCase()} ` +
          `${context.requestName} → ${context.handlerName} failed after ${duration}ms: ` +
          `${err.name}: ${err.message}`,
      );
      throw error;
    }
  }

  /** Calls the appropriate Logger method, or skips entirely when level is `'none'`. */
  private log(level: LogLevel | 'none', message: string): void {
    if (level !== 'none') {
      this.logger[level](message);
    }
  }
}
