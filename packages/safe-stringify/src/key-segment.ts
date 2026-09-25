/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Character that separates the segments of a composite key. */
const SEGMENT_SEPARATOR = ':';

/**
 * Marker written in place of a segment whose value is absent.
 *
 * Deliberately `\-` rather than a control character, so a key can be stored in
 * a PostgreSQL `text` column, which rejects `U+0000`. It is also unambiguous — escaping a real
 * value only ever produces `\\` or `\:`, so no genuine segment can render as
 * `\-`, and a literal `\-` inside a value escapes to `\\-`.
 */
export const ABSENT_SEGMENT = '\\-';

/**
 * Escapes the structural characters of a `:`-joined composite key.
 *
 * Joining raw values with `:` makes two different tuples collapse into one key
 * whenever a value contains the separator:
 *
 * ```text
 * ['a:b', 'c'] → "a:b:c"
 * ['a', 'b:c'] → "a:b:c"     ← same key, different callers
 * ```
 *
 * Identifiers that reach a key are routinely email addresses, external subject
 * claims and composite IDs. A collision means two callers share a rate-limit
 * bucket or a cache entry.
 *
 * The backslash is escaped first so that an input already containing one cannot
 * be used to forge a separator.
 */
export function escapeKeySegment(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
}

/**
 * Joins segments into one key, escaping each so distinct tuples stay distinct.
 *
 * `undefined` and `null` become {@link ABSENT_SEGMENT} rather than being dropped,
 * so a tuple with a missing value cannot collapse onto a shorter tuple that never
 * had that position at all. Omitting an absent tenant, for example, would make a
 * tenant-less key identical to the key of a single-tenant deployment.
 */
export function joinKeySegments(
  segments: readonly (string | undefined | null)[],
): string {
  return segments
    .map((segment) =>
      segment === undefined || segment === null
        ? ABSENT_SEGMENT
        : escapeKeySegment(segment),
    )
    .join(SEGMENT_SEPARATOR);
}
