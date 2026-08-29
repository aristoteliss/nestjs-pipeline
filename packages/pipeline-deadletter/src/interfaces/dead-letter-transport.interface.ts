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

/** Request kinds as classified by the pipeline. */
export type DeadLetterRequestKind = 'command' | 'query' | 'event' | 'unknown';

/** Serializable description of the failure that produced a dead letter. */
export interface DeadLetterError {
  /** Error class name (e.g. `TimeoutError`), or `'unknown'` for non-Error throws. */
  name: string;
  /** Error message. */
  message: string;
  /** Stack trace, unless suppressed via `includeStack: false`. */
  stack?: string;
}

/**
 * A single dead-letter record for a pipeline request that failed (after any
 * retries) and was forwarded to a
 * {@link DeadLetterTransport} for inspection / replay.
 *
 * The shape is transport-neutral, but `payload` and `metadata` are supplied by
 * the application and must satisfy the configured transport's serialization
 * requirements.
 */
export interface DeadLetterRecord {
  /** Correlation ID of the failed pipeline run (for cross-system tracing). */
  correlationId: string;
  /** Whether the failed request was a command, query, event, or unknown. */
  requestKind: DeadLetterRequestKind;
  /** Request class name, e.g. `CreateUserCommand`. */
  requestName: string;
  /** Handler class name, e.g. `CreateUserHandler`. */
  handlerName: string;
  /** The original request payload (the command/query/event instance). */
  payload: unknown;
  /** Details of the error that caused the failure. */
  error: DeadLetterError;
  /** ISO-8601 timestamp of when the dead letter was produced. */
  failedAt: string;
  /** Optional extra metadata produced by the behavior's `metadata` factory. */
  metadata?: Record<string, unknown>;
}

/**
 * Transport-agnostic sink for dead letters.
 *
 * Implement this once per backend; the bundled implementations are
 * {@link BullMqDeadLetterTransport} (default), {@link RabbitMqDeadLetterTransport},
 * and {@link PostgresDeadLetterTransport}. Because the {@link DeadLetterBehavior}
 * depends only on this interface, swapping the backend is a one-line change in
 * {@link DeadLetterModule.forRoot}.
 */
export interface DeadLetterTransport {
  /**
   * Persist / publish a single dead-letter record.
   *
   * Implementations should be resilient and fast; a throw here is caught by the
   * behavior and logged, but never masks the original handler error.
   *
   * @param record - The failed request snapshot to forward.
   */
  send(record: DeadLetterRecord): Promise<void>;
}
