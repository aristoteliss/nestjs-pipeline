/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { toStrictJsonValue } from '@nestjs-pipeline/core';
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
