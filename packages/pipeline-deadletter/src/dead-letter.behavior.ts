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
  type IPipelineContext,
  LOGGING_BEHAVIOR_LOGGER,
  type NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineBehaviorDiagnostic,
  type PipelineBehaviorValidationContext,
  type PipelineItemToken,
  setPipelineItem,
} from '@nestjs-pipeline/core';
import {
  DEAD_LETTER_DEFAULT_OPTIONS,
  DEAD_LETTER_TRANSPORT,
} from './constants/tokens';
import { buildDeadLetterRecord } from './helpers/build-record';
import { currentRedriveId } from './helpers/redrive-scope';
import type { DeadLetterBehaviorOptions } from './interfaces/dead-letter-options.interface';
import type {
  DeadLetterRequestKind,
  DeadLetterTransport,
} from './interfaces/dead-letter-transport.interface';

/**
 * Kinds captured when `captureKinds` is omitted: events. A command's or a
 * query's caller already receives the error; an event handler's failure has
 * no caller to receive it.
 */
const DEFAULT_CAPTURE_KINDS: readonly DeadLetterRequestKind[] = ['event'];

/**
 * Unique symbol key set on `context.items` to `true` or `false` recording whether
 * delivery to the dead-letter transport succeeded.
 *
 * @example
 * ```ts
 * const delivered = context.items.get(DEAD_LETTER_ITEM) === true;
 * ```
 */
export const DEAD_LETTER_ITEM = Symbol('DEAD_LETTER_ITEM');

/**
 * Typed token for {@link DEAD_LETTER_ITEM}: the dead-letter delivery outcome. Reads and writes the same
 * `context.items` entry through `getPipelineItem` / `requirePipelineItem`.
 */
export const DEAD_LETTER_ITEM_TOKEN: PipelineItemToken<boolean> =
  createPipelineItem<boolean>('DEAD_LETTER_ITEM', DEAD_LETTER_ITEM);

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
 * retries are exhausted, but **inside** request validation behaviors so expected
 * client validation errors are not dead-lettered.
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
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    validate: (
      context: PipelineBehaviorValidationContext,
    ): PipelineBehaviorDiagnostic[] | undefined => {
      const options = context.effectiveOptions as
        | DeadLetterBehaviorOptions
        | undefined;
      if (options?.rethrow !== false || context.requestKind === 'event') {
        return undefined;
      }
      return [
        {
          handlerName: context.handlerName,
          behaviorName: DeadLetterBehavior.name,
          message: `rethrow: false on a ${context.requestKind} handler would answer its caller with undefined instead of the error`,
          fix: 'Remove rethrow: false; swallowing a captured error is allowed on event handlers only.',
        },
      ];
    },
  };

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

    this.logger =
      logger ?? new Logger(DeadLetterBehavior.name, { timestamp: true });
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    try {
      return await next();
    } catch (error) {
      // A redrive records its own attempt on the existing record, and must see
      // the failure: never capture it again, never swallow it.
      if (currentRedriveId() !== undefined) throw error;

      const options = this.resolveOptions(context);
      const shouldCapture = this.shouldCapture(context, options, error);
      let recordId: string | undefined;

      if (shouldCapture) {
        recordId = await this.capture(context, error, options);
        setPipelineItem(
          context,
          DEAD_LETTER_ITEM_TOKEN,
          recordId !== undefined,
        );
      }

      // Excluding a request kind or ignoring an error means this behavior is inactive
      // for that failure; it must not silently swallow an error it did not capture.
      // Only an event's error is ever swallowed: a command or query has a caller.
      if (
        (options.rethrow ?? true) ||
        context.requestKind !== 'event' ||
        recordId === undefined
      ) {
        throw error;
      }

      this.logger.error?.(
        `Dead-lettered and swallowed ${context.requestName} ` +
          `(correlationId: ${context.correlationId}, deadLetterId: ${recordId})`,
        DeadLetterBehavior.name,
      );
      return undefined;
    }
  }

  /** Forwards the failed request; returns the record id once the transport has it. */
  private async capture(
    context: IPipelineContext,
    error: unknown,
    options: DeadLetterBehaviorOptions,
  ): Promise<string | undefined> {
    try {
      const record = buildDeadLetterRecord(context, error, options);
      await this.transport.send(record);
      this.logger.warn?.(
        `Dead-lettered ${context.requestKind} ${context.requestName} ` +
          `(correlationId: ${context.correlationId}, deadLetterId: ${record.id})`,
        DeadLetterBehavior.name,
      );
      return record.id;
    } catch (transportError) {
      // The sink failing must never hide the real handler error: log and move on.
      this.logger.error?.(
        `Failed to dead-letter ${context.requestName}: ` +
          `${transportError instanceof Error ? transportError.message : transportError}`,
        DeadLetterBehavior.name,
      );
      return undefined;
    }
  }

  /** Whether this request kind and error are configured to be captured. */
  private shouldCapture(
    context: IPipelineContext,
    options: DeadLetterBehaviorOptions,
    error: unknown,
  ): boolean {
    const captureKinds = options.captureKinds ?? DEFAULT_CAPTURE_KINDS;
    if (!captureKinds.includes(context.requestKind)) {
      return false;
    }

    const { ignoreErrors } = options;
    return !(
      (typeof ignoreErrors === 'function' || Array.isArray(ignoreErrors)) &&
      matchesIgnoredError(ignoreErrors, error, context)
    );
  }

  /** Merges per-handler options over the module defaults. */
  private resolveOptions(context: IPipelineContext): DeadLetterBehaviorOptions {
    const handlerOptions =
      context.getBehaviorOptions<DeadLetterBehaviorOptions>(DeadLetterBehavior);
    if (!handlerOptions) return this.defaults;

    const merged: DeadLetterBehaviorOptions = {
      ...this.defaults,
      ...handlerOptions,
    };

    if (this.defaults.ignoreErrors && handlerOptions.ignoreErrors) {
      if (
        Array.isArray(this.defaults.ignoreErrors) &&
        Array.isArray(handlerOptions.ignoreErrors)
      ) {
        merged.ignoreErrors = [
          ...this.defaults.ignoreErrors,
          ...handlerOptions.ignoreErrors,
        ];
      } else {
        const defaultFilter = this.defaults.ignoreErrors;
        const handlerFilter = handlerOptions.ignoreErrors;
        merged.ignoreErrors = (err, ctx) =>
          matchesIgnoredError(defaultFilter, err, ctx) ||
          matchesIgnoredError(handlerFilter, err, ctx);
      }
    }

    if (this.defaults.redactKeys && handlerOptions.redactKeys) {
      merged.redactKeys = Array.from(
        new Set([...this.defaults.redactKeys, ...handlerOptions.redactKeys]),
      );
    }

    return merged;
  }
}

function matchesIgnoredError(
  filter: NonNullable<DeadLetterBehaviorOptions['ignoreErrors']>,
  error: unknown,
  context: IPipelineContext,
): boolean {
  if (typeof filter === 'function') return filter(error, context);
  for (const target of filter) {
    if (typeof target === 'function' && error instanceof target) return true;
  }
  return false;
}
