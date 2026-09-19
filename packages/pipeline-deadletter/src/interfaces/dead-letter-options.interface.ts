/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type {
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
  Type,
} from '@nestjs/common';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import type {
  DeadLetterRequestKind,
  DeadLetterTransport,
} from './dead-letter-transport.interface';

/**
 * Factory producing extra, request-aware metadata to attach to a dead letter
 * (e.g. tenant id, user id, attempt count read from `context.items`).
 */
export type DeadLetterMetadataFactory = (
  context: IPipelineContext,
) => Record<string, unknown>;

/**
 * Per-handler (and module-default) options for {@link DeadLetterBehavior}.
 *
 * Supplied per handler via
 * `@UsePipeline([DeadLetterBehavior, { ... }])`, shallow-merged over the
 * module-wide defaults (handler keys win).
 *
 * @example Fire-and-forget event capture
 * ```ts
 * @UsePipeline([DeadLetterBehavior, {
 *   captureKinds: ['event'],
 *   rethrow: false,
 *   redactKeys: ['token'],
 * }])
 * export class UserCreatedHandler {}
 * ```
 */
export interface DeadLetterBehaviorOptions {
  /**
   * Whether to re-throw the original error after dead-lettering.
   *
   * - `true` (default) — propagate after the capture decision; the caller sees the
   *   failure (HTTP 5xx, command rejection, …). Use for commands/queries.
   * - `false` — swallow only when this request kind is selected for capture;
   *   the pipeline resolves to `undefined`. Use for fire-and-forget events.
   */
  rethrow?: boolean;

  /**
   * Include the error stack trace in the record. Default `true`.
   * Set `false` to keep records lean or avoid leaking internals downstream.
   */
  includeStack?: boolean;

  /**
   * Restrict capture to specific request kinds. When omitted, every kind is
   * captured. Example: `['command', 'event']` to skip read-side query failures.
   */
  captureKinds?: DeadLetterRequestKind[];

  /**
   * Filter predicate or error types to ignore.
   * Matching errors are re-thrown without being sent to the dead-letter transport.
   * Useful for ignoring expected client validation errors (e.g. ZodValidationError).
   */
  ignoreErrors?:
    | Array<Type<unknown> | (abstract new (...args: never[]) => unknown)>
    | ((error: unknown, context: IPipelineContext) => boolean);

  /** Produce extra metadata to merge into the dead-letter record. */
  metadata?: DeadLetterMetadataFactory;

  /**
   * Custom redactor function for the captured request payload.
   * When supplied, takes precedence over {@link redactKeys}.
   */
  redact?: (payload: unknown) => unknown;

  /**
   * Field names to mask with `[REDACTED]` in the captured request payload.
   * Case-insensitive matching. Merged on top of {@link DEFAULT_REDACT_KEYS}.
   */
  redactKeys?: string[];
}

/**
 * Options for {@link DeadLetterModule.forRoot}.
 *
 * @example
 * ```ts
 * DeadLetterModule.forRoot({
 *   transport: new PostgresDeadLetterTransport(pool),
 *   defaults: {
 *     captureKinds: ['command', 'event'],
 *     redactKeys: ['code'],
 *   },
 * });
 * ```
 */
export interface DeadLetterModuleOptions {
  /**
   * The dead-letter sink. Pass a bundled transport
   * ({@link BullMqDeadLetterTransport}, {@link RabbitMqDeadLetterTransport},
   * {@link PostgresDeadLetterTransport}) or your own {@link DeadLetterTransport}.
   */
  transport: DeadLetterTransport;
  /** Module-wide default options merged under each handler's options. */
  defaults?: DeadLetterBehaviorOptions;
}

/**
 * Options for {@link DeadLetterModule.forRootAsync} — build the transport from
 * injected dependencies (e.g. a `@InjectQueue()` BullMQ queue, an AMQP channel,
 * or a pg `Pool`).
 *
 * @example BullMQ transport from Nest DI
 * ```ts
 * DeadLetterModule.forRootAsync({
 *   imports: [BullModule.registerQueue({ name: 'dead-letters' })],
 *   inject: [getQueueToken('dead-letters')],
 *   useFactory: (queue) => new BullMqDeadLetterTransport(queue),
 * });
 * ```
 */
export interface DeadLetterModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /** Factory returning the {@link DeadLetterTransport} (may be async). */
  useFactory: (
    ...args: never[]
  ) => DeadLetterTransport | Promise<DeadLetterTransport>;
  /** Providers injected into `useFactory`. */
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  /** Module-wide default options merged under each handler's options. */
  defaults?: DeadLetterBehaviorOptions;
}
