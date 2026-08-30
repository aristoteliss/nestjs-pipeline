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
import {
  DEAD_LETTER_DEFAULT_OPTIONS,
  DEAD_LETTER_TRANSPORT,
} from './constants/tokens';
import { buildDeadLetterRecord } from './helpers/build-record';
import type { DeadLetterBehaviorOptions } from './interfaces/dead-letter-options.interface';
import type { DeadLetterTransport } from './interfaces/dead-letter-transport.interface';

/** Item key set after a dead-letter capture is attempted, even if transport delivery fails. */
export const DEAD_LETTER_ITEM = 'dead-letter.captured';

/**
 * Pipeline behavior that forwards **failed** requests to a dead-letter sink.
 *
 * When the wrapped handler (and anything nested inside it, such as
 * `ResilienceBehavior` retries) throws, this behavior captures a
 * {@link DeadLetterRecord} and hands it to the configured
 * {@link DeadLetterTransport}, then — by default — re-throws so the caller still
 * sees the failure. Payload and metadata must be serializable by that transport.
 *
 * Transport-agnostic by design: it depends only on {@link DeadLetterTransport},
 * so the backend (BullMQ, RabbitMQ, Postgres, …) is a one-line swap in
 * {@link DeadLetterModule.forRoot}.
 *
 * **Ordering:** place this **outside** retry behaviors so it only fires once
 * retries are exhausted, e.g. global `before: [DeadLetterBehavior]` with
 * `ResilienceBehavior` nested closer to the handler.
 *
 * @example Fire-and-forget event — capture and swallow
 * ```ts
 * @EventsHandler(UserCreatedEvent)
 * @UsePipeline([DeadLetterBehavior, { rethrow: false }])
 * export class SendWelcomeEmailOnUserCreated {}
 * ```
 */
@Injectable()
export class DeadLetterBehavior implements IPipelineBehavior {
  private readonly logger: LoggerService;
  private readonly defaults: DeadLetterBehaviorOptions;

  constructor(
    @Inject(DEAD_LETTER_TRANSPORT)
    private readonly transport: DeadLetterTransport,
    @Optional()
    @Inject(DEAD_LETTER_DEFAULT_OPTIONS)
    defaults?: DeadLetterBehaviorOptions,
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    logger?: LoggerService,
  ) {
    this.defaults = defaults ?? {};

    if (!logger) {
      this.logger = new Logger(DeadLetterBehavior.name, { timestamp: true });
      return;
    }

    this.logger = logger;
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    try {
      return await next();
    } catch (error) {
      const options = this.resolveOptions(context);
      const shouldCapture = this.shouldCapture(context, options);

      if (shouldCapture) {
        await this.capture(context, error, options);
        context.items.set(DEAD_LETTER_ITEM, true);
      }

      // Excluding a request kind means this behavior is inactive for that
      // failure; it must not silently swallow an error it did not capture.
      if ((options.rethrow ?? true) || !shouldCapture) throw error;

      this.logger.warn?.(
        `Dead-lettered and swallowed ${context.requestName} ` +
          `(correlationId: ${context.correlationId})`,
        DeadLetterBehavior.name,
      );
      return undefined;
    }
  }

  /** Forwards the failed request to the transport, never masking the original error. */
  private async capture(
    context: IPipelineContext,
    error: unknown,
    options: DeadLetterBehaviorOptions,
  ): Promise<void> {
    try {
      const record = buildDeadLetterRecord(context, error, options);
      await this.transport.send(record);
      this.logger.warn?.(
        `Dead-lettered ${context.requestKind} ${context.requestName} ` +
          `(correlationId: ${context.correlationId})`,
        DeadLetterBehavior.name,
      );
    } catch (transportError) {
      // The sink failing must never hide the real handler error: log and move on.
      this.logger.error?.(
        `Failed to dead-letter ${context.requestName}: ` +
          `${transportError instanceof Error ? transportError.message : transportError}`,
        DeadLetterBehavior.name,
      );
    }
  }

  /** Whether this request kind is configured to be captured. */
  private shouldCapture(
    context: IPipelineContext,
    options: DeadLetterBehaviorOptions,
  ): boolean {
    if (!options.captureKinds) return true;
    return options.captureKinds.includes(context.requestKind);
  }

  /** Shallow-merges per-handler options over the module defaults. */
  private resolveOptions(context: IPipelineContext): DeadLetterBehaviorOptions {
    const handlerOptions =
      context.getBehaviorOptions<DeadLetterBehaviorOptions>(DeadLetterBehavior);
    if (!handlerOptions) return this.defaults;
    return { ...this.defaults, ...handlerOptions };
  }
}
