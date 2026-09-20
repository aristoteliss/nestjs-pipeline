/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Type } from '@nestjs/common';
import type { IPipelineBehavior } from '../interfaces/pipeline.behavior.interface';
import { type BehaviorId, getBehaviorId } from './behavior-id';

/** Validates a declaration before reflection or Nest provider registration. */
export function behaviorEntryType(
  entry: unknown,
  location: string,
  allowTuple = true,
): Type<IPipelineBehavior> {
  const tuple = Array.isArray(entry);
  const candidate = tuple && allowTuple ? entry[0] : entry;
  if (
    typeof candidate !== 'function' ||
    !candidate.prototype ||
    (tuple && entry.length !== 2)
  ) {
    throw new TypeError(
      `${location}: expected a behavior class${allowTuple ? ' or a [BehaviorClass, options] tuple' : ''}. Check for undefined references caused by circular imports.`,
    );
  }
  if (
    tuple &&
    (entry[1] === null ||
      typeof entry[1] !== 'object' ||
      Array.isArray(entry[1]))
  ) {
    throw new TypeError(
      `${location}: options for ${candidate.name} must be an object.`,
    );
  }
  return candidate as Type<IPipelineBehavior>;
}

/** First identity fixes placement; the last tuple supplies options. Bare repeats preserve options. */
export function normalizeBehaviorEntries(
  entries: readonly unknown[],
  location: string,
  allowTuple = true,
): {
  types: Type<IPipelineBehavior>[];
  options: Map<BehaviorId, Record<string, unknown>>;
} {
  const types: Type<IPipelineBehavior>[] = [];
  const options = new Map<BehaviorId, Record<string, unknown>>();
  const seen = new Set<BehaviorId>();
  entries.forEach((entry, index) => {
    const type = behaviorEntryType(
      entry,
      `${location}, entry ${index}`,
      allowTuple,
    );
    const id = getBehaviorId(type);
    if (Array.isArray(entry))
      options.set(id, entry[1] as Record<string, unknown>);
    if (!seen.has(id)) {
      seen.add(id);
      types.push(type);
    }
  });
  return { types, options };
}
