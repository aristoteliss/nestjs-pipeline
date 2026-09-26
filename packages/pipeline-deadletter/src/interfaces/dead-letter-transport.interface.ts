/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Request kinds as classified by the pipeline. */
export type DeadLetterRequestKind = 'command' | 'query' | 'event' | 'unknown';

/** Lifecycle of a dead letter. */
export type DeadLetterStatus = 'open' | 'resolved';

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
  /**
   * Unique id of this dead letter (UUIDv7, so ids sort in capture order), used
   * to redrive or resolve it.
   */
  id: string;
  /** Correlation ID of the failed pipeline run (for cross-system tracing). */
  correlationId: string;
  /** Active tenant identifier if execution occurred within a multi-tenant context. */
  tenantId?: string;
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
  /** Metadata from the `metadata` factory, plus `tenantId` when present. */
  metadata?: Record<string, unknown>;
  /** Redrive attempts made so far; `0` when captured. */
  attempts: number;
  /** `'open'` until a redrive succeeds or it is resolved by hand. */
  status: DeadLetterStatus;
  /**
   * `true` when redaction changed the payload (or a custom `redact` ran): the
   * stored payload is not the original request, so it is not redriven as is.
   */
  payloadRedacted: boolean;
  /** Error of the last failed redrive attempt, if any. */
  lastError?: DeadLetterError;
  /** ISO-8601 timestamp of when the record was resolved. */
  resolvedAt?: string;
}

/**
 * Transport-agnostic sink for dead letters.
 *
 * Implement this once per backend; the bundled implementations are
 * {@link BullMqDeadLetterTransport}, {@link RabbitMqDeadLetterTransport},
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

/** Filter for {@link DeadLetterStore.list}. */
export interface DeadLetterListFilter {
  status?: DeadLetterStatus;
  requestName?: string;
  /** Most records to return, oldest first. Default `100`. */
  limit?: number;
}

/**
 * A transport that also keeps its records, so they can be listed, redriven
 * with {@link DeadLetterRedriver}, and resolved. `PostgresDeadLetterTransport`
 * implements it; queue transports rely on their broker's own dead-letter tooling.
 */
export interface DeadLetterStore extends DeadLetterTransport {
  /** The record with this id, or `undefined`. */
  get(id: string): Promise<DeadLetterRecord | undefined>;
  /** Records matching the filter, oldest first. */
  list(filter?: DeadLetterListFilter): Promise<DeadLetterRecord[]>;
  /** Counts one failed redrive attempt and keeps its error. */
  recordAttempt(id: string, error: DeadLetterError): Promise<void>;
  /** Closes the record. */
  markResolved(id: string): Promise<void>;
}
