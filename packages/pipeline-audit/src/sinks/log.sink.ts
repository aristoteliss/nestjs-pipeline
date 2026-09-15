/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { stringifyAuditValue } from '../helpers/json';
import type { AuditRecord } from '../interfaces/audit-record.interface';
import type { AuditSink } from '../interfaces/audit-sink.interface';

/** Minimal structural logger satisfied by the NestJS `Logger` and `console`. */
export interface AuditLoggerLike {
  log(message: string): void;
  warn(message: string): void;
}

/** Options for {@link LogAuditSink}. */
export interface LogAuditSinkOptions {
  /** Logger to write to. Default: the global `console`. */
  logger?: AuditLoggerLike;
  /** Pretty-print the JSON record over multiple lines. Default `false`. */
  pretty?: boolean;
}

/**
 * Zero-dependency {@link AuditSink} that writes each record as a JSON line to a
 * logger (the global `console` by default). The default sink — ideal for local
 * development, tests, or shipping audit logs through your existing log pipeline.
 *
 * Failures are routed to `warn`, successes to `log`, so they are easy to filter.
 *
 * @example
 * ```ts
 * import { Logger } from '@nestjs/common';
 * new LogAuditSink({ logger: new Logger('Audit'), pretty: true });
 * ```
 */
export class LogAuditSink implements AuditSink {
  private readonly logger: AuditLoggerLike;
  private readonly pretty: boolean;

  constructor(options: LogAuditSinkOptions = {}) {
    this.logger = options.logger ?? console;
    this.pretty = options.pretty ?? false;
  }

  write(record: AuditRecord): void {
    const line = stringifyAuditValue(record, this.pretty ? 2 : undefined);

    if (record.outcome === 'failure') {
      this.logger.warn(line);
      return;
    }
    this.logger.log(line);
  }
}
