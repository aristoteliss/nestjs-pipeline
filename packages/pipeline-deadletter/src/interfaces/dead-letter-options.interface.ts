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

import type {
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
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
 */
export interface DeadLetterBehaviorOptions {
  /**
   * Whether to re-throw the original error after dead-lettering.
   *
   * - `true` (default) — capture **and** propagate; the caller still sees the
   *   failure (HTTP 5xx, command rejection, …). Use for commands/queries.
   * - `false` — capture and **swallow**; the pipeline resolves to `undefined`.
   *   Use for fire-and-forget event handlers that must not crash on failure.
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

  /** Produce extra metadata to merge into the dead-letter record. */
  metadata?: DeadLetterMetadataFactory;
}

/**
 * Options for {@link DeadLetterModule.forRoot}.
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
