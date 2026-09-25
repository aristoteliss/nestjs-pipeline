/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { toStrictJsonValue } from '@cqrs-ddd/safe-stringify';
import type {
  IdempotencyRecord,
  JsonValue,
} from '../interfaces/idempotency-record.interface';

/** Convert a replay value to the representation shared by durable stores. */
export function toJsonSnapshot(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;

  try {
    return toStrictJsonValue(value) as JsonValue;
  } catch {
    throw new TypeError(
      'Idempotency responses must be acyclic JSON-serializable values.',
    );
  }
}

/** Clone a record with the same JSON boundary used by Redis and Postgres. */
export function cloneIdempotencyRecord(
  record: IdempotencyRecord,
): IdempotencyRecord {
  try {
    return JSON.parse(JSON.stringify(record)) as IdempotencyRecord;
  } catch {
    throw new TypeError(
      'Idempotency records must contain only acyclic JSON-serializable values.',
    );
  }
}
