/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  Inject,
  Injectable,
  Logger,
  type LoggerService,
  Optional,
} from '@nestjs/common';
import {
  createPipelineItem,
  type IPipelineBehavior,
  type IPipelineBehaviorContract,
  type IPipelineBehaviorOptionsResolver,
  type IPipelineContext,
  LOGGING_BEHAVIOR_LOGGER,
  type NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineBehaviorDiagnostic,
  type PipelineBehaviorValidationContext,
  type PipelineItemToken,
  setPipelineItem,
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
 * Typed token for {@link AUDIT_RECORD_ITEM}: the produced audit record. Reads and writes the same
 * `context.items` entry through `getPipelineItem` / `requirePipelineItem`.
 */
export const AUDIT_RECORD_ITEM_TOKEN: PipelineItemToken<AuditRecord> =
  createPipelineItem<AuditRecord>('AUDIT_RECORD_ITEM', AUDIT_RECORD_ITEM);

/**
 * Pipeline behavior that writes an {@link AuditRecord} for every audited
 * request — **on both success and failure** — to a pluggable {@link AuditSink}.
 *
 * For each run it times the handler, resolves the actor and action, redacts the
 * payload (and optionally the response), then forwards the record. Handler
 * failures are recorded before propagation. With the default `failOpen: true`,
 * sink failures are logged and the original handler result/error is preserved.
 * With `failOpen: false`, a sink/build failure on the **success path** fails the
 * request. If the handler already failed, the caller receives the handler's own
 * error, unchanged, and the audit failure is logged.
 *
 * Sink-agnostic by design: it depends only on {@link AuditSink}, so the backend
 * (console, Postgres, an event store, …) is a one-line swap in
 * {@link AuditModule.forRoot}. Record-building failures are logged and ignored
 * in fail-open mode, or propagated according to the same fail-closed semantics.
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
 *
 * @example Compliance-sensitive fail-closed auditing
 * ```ts
 * @UsePipeline([AuditBehavior, {
 *   action: 'payment.refund',
 *   failOpen: false,
 *   captureResponse: false,
 * }])
 * export class RefundPaymentHandler {}
 * ```
 */
@Injectable()
export class AuditBehavior
  implements
    IPipelineBehavior,
    IPipelineBehaviorOptionsResolver<AuditBehaviorOptions>
{
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    validate: (
      context: PipelineBehaviorValidationContext,
    ): PipelineBehaviorDiagnostic[] | undefined => {
      const invalid = findInvalidFactory(
        (context.effectiveOptions ?? {}) as AuditBehaviorOptions,
      );
      if (!invalid) return undefined;
      return [
        {
          handlerName: context.handlerName,
          behaviorName: AuditBehavior.name,
          message: invalid,
          fix: 'Pass functions for the actor, metadata and redact options of AuditBehavior.',
        },
      ];
    },
  };

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

    this.logger = logger ?? new Logger(AuditBehavior.name, { timestamp: true });
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options = this.resolveEffectiveOptions(
      context.getBehaviorOptions<AuditBehaviorOptions>(AuditBehavior),
    );

    if (
      options.captureKinds &&
      !options.captureKinds.includes(context.requestKind)
    ) {
      return next();
    }

    const failOpen = options.failOpen ?? true;
    this.validateFactories(options, failOpen);

    const startedAt = new Date();
    const start = performance.now();

    let response: unknown;
    try {
      response = await next();
    } catch (error) {
      try {
        await this.record({
          context,
          options,
          error,
          failed: true,
          durationMs: performance.now() - start,
          startedAt: startedAt.toISOString(),
        });
      } catch (recordError) {
        this.diagnose(
          'error',
          `Audit recording also failed after request error: ${recordError instanceof Error ? recordError.message : recordError}`,
        );
      }
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
    const failOpen = input.options.failOpen ?? true;
    let record: AuditRecord;
    try {
      record = buildAuditRecord(input);
    } catch (buildError) {
      const message =
        `Failed to build audit record for ${input.context.requestName}: ` +
        `${buildError instanceof Error ? buildError.message : buildError}`;
      this.reportFailure(message, failOpen, buildError);
      return;
    }

    setPipelineItem(input.context, AUDIT_RECORD_ITEM_TOKEN, record);

    try {
      await this.sink.write(record);
    } catch (sinkError) {
      const message =
        `Failed to write audit record for ${record.requestName} ` +
        `(correlationId: ${record.correlationId}): ` +
        `${sinkError instanceof Error ? sinkError.message : sinkError}`;
      this.reportFailure(message, failOpen, sinkError);
    }
  }

  /** Rejects a non-function factory option before request execution. */
  private validateFactories(
    options: AuditBehaviorOptions,
    failOpen: boolean,
  ): void {
    const invalid = findInvalidFactory(options);
    if (invalid) this.reportFailure(invalid, failOpen, new TypeError(invalid));
  }

  /** Logs an audit failure, then fails open or rethrows `error`. */
  private reportFailure(
    message: string,
    failOpen: boolean,
    error: unknown,
  ): void {
    if (failOpen) {
      this.diagnose('warn', `${message}; failing open`);
      return;
    }
    this.diagnose('error', `${message}; failing closed`);
    throw error;
  }

  /** Diagnostic logging never changes the request outcome. */
  private diagnose(level: 'warn' | 'error', message: string): void {
    try {
      this.logger[level]?.(message, AuditBehavior.name);
    } catch {
      // A failing logger must not override the fail-open/fail-closed decision.
    }
  }

  /** Shallow-merges per-handler options over the module defaults. */
  resolveEffectiveOptions(
    options?: AuditBehaviorOptions,
  ): AuditBehaviorOptions {
    if (!options) return this.defaults;
    return { ...this.defaults, ...options };
  }
}

const FACTORY_OPTIONS = [
  ['actor', 'actor factory'],
  ['metadata', 'metadata factory'],
  ['redact', 'redactor'],
] as const;

function findInvalidFactory(options: AuditBehaviorOptions): string | undefined {
  for (const [option, label] of FACTORY_OPTIONS) {
    const value = options[option];
    if (value !== undefined && typeof value !== 'function') {
      return `Invalid audit ${label}: expected a function, received ${typeof value}`;
    }
  }
  return undefined;
}
