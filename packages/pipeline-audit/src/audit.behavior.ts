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

import {
  Inject,
  Injectable,
  Logger,
  type LoggerService,
  Optional,
} from '@nestjs/common';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  LOGGING_BEHAVIOR_LOGGER,
  type NextDelegate,
} from '@nestjs-pipeline/core';
import { AUDIT_DEFAULT_OPTIONS, AUDIT_SINK } from './constants/tokens';
import { buildAuditRecord } from './helpers/build-record';
import type { AuditBehaviorOptions } from './interfaces/audit-options.interface';
import type { AuditRecord } from './interfaces/audit-record.interface';
import type { AuditSink } from './interfaces/audit-sink.interface';

/**
 * Unique symbol key used on `context.items` to store or retrieve the produced {@link AuditRecord}.
 *
 * @example
 * ```ts
 * const record = context.items.get(AUDIT_RECORD_ITEM) as AuditRecord | undefined;
 * ```
 */
export const AUDIT_RECORD_ITEM = Symbol('AUDIT_RECORD_ITEM');

/**
 * Pipeline behavior that writes an {@link AuditRecord} for every audited
 * request — **on both success and failure** — to a pluggable {@link AuditSink}.
 *
 * For each run it times the handler, resolves the actor and action, redacts the
 * payload (and optionally the response), then forwards the record. Handler
 * failures are recorded before propagation. With the default `failOpen: true`,
 * sink failures are logged and the original handler result/error is preserved;
 * with `failOpen: false`, a sink failure is propagated and can replace a handler
 * error that was being audited.
 *
 * Sink-agnostic by design: it depends only on {@link AuditSink}, so the backend
 * (console, Postgres, an event store, …) is a one-line swap in
 * {@link AuditModule.forRoot}. Record-building failures are logged and ignored.
 *
 * **Ordering:** place this near the **outside** of the chain (e.g. global
 * `before`) so the duration covers the whole handler, and after any auth
 * behavior that populates `context.items` for the {@link AuditBehaviorOptions.actor}
 * factory.
 *
 * @example Per-handler, with an actor read from an upstream auth behavior
 * ```ts
 * @CommandHandler(DeleteUserCommand)
 * @UsePipeline([AuditBehavior, {
 *   action: 'user.delete',
 *   severity: 'high',
 *   actor: (c) => ({ id: c.items.get('currentUserId') }),
 * }])
 * export class DeleteUserHandler {}
 * ```
 */
@Injectable()
export class AuditBehavior implements IPipelineBehavior {
  private readonly logger: LoggerService;
  private readonly defaults: AuditBehaviorOptions;

  constructor(
    @Inject(AUDIT_SINK)
    private readonly sink: AuditSink,
    @Optional()
    @Inject(AUDIT_DEFAULT_OPTIONS)
    defaults?: AuditBehaviorOptions,
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    logger?: LoggerService,
  ) {
    this.defaults = defaults ?? {};

    if (!logger) {
      this.logger = new Logger(AuditBehavior.name, { timestamp: true });
      return;
    }

    this.logger = logger;
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options = this.resolveOptions(context);

    if (!this.shouldAudit(context, options)) {
      return next();
    }

    const startedAt = new Date();
    const start = performance.now();

    let response: unknown;
    try {
      response = await next();
    } catch (error) {
      await this.record({
        context,
        options,
        error,
        failed: true,
        durationMs: performance.now() - start,
        startedAt: startedAt.toISOString(),
      });
      throw error;
    }

    await this.record({
      context,
      options,
      response,
      failed: false,
      durationMs: performance.now() - start,
      startedAt: startedAt.toISOString(),
    });
    return response;
  }

  /** Build the record, forward it to the sink, and stash it on the context. */
  private async record(input: {
    context: IPipelineContext;
    options: AuditBehaviorOptions;
    response?: unknown;
    error?: unknown;
    failed: boolean;
    durationMs: number;
    startedAt: string;
  }): Promise<void> {
    let record: AuditRecord;
    try {
      record = buildAuditRecord(input);
    } catch (buildError) {
      // Building the record must never break the request.
      this.logger.error?.(
        `Failed to build audit record for ${input.context.requestName}: ` +
          `${buildError instanceof Error ? buildError.message : buildError}`,
        AuditBehavior.name,
      );
      return;
    }

    input.context.items.set(AUDIT_RECORD_ITEM, record);

    try {
      await this.sink.write(record);
    } catch (sinkError) {
      const message =
        `Failed to write audit record for ${record.requestName} ` +
        `(correlationId: ${record.correlationId}): ` +
        `${sinkError instanceof Error ? sinkError.message : sinkError}`;

      if (input.options.failOpen ?? true) {
        this.logger.warn?.(`${message}; failing open`, AuditBehavior.name);
        return;
      }
      this.logger.error?.(`${message}; failing closed`, AuditBehavior.name);
      throw sinkError;
    }
  }

  /** Whether this request kind is configured to be audited. */
  private shouldAudit(
    context: IPipelineContext,
    options: AuditBehaviorOptions,
  ): boolean {
    if (!options.captureKinds) return true;
    return options.captureKinds.includes(context.requestKind);
  }

  /** Shallow-merges per-handler options over the module defaults. */
  private resolveOptions(context: IPipelineContext): AuditBehaviorOptions {
    const handlerOptions =
      context.getBehaviorOptions<AuditBehaviorOptions>(AuditBehavior);
    if (!handlerOptions) return this.defaults;
    return { ...this.defaults, ...handlerOptions };
  }
}
