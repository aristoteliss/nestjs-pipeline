/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** The replacement character that stands in for what `jsonb` cannot hold. */
const REPLACEMENT = '\\ufffd';

/**
 * An escaped backslash (kept, so the scan stays aligned on escapes), a
 * surrogate pair (kept), a `\u0000` escape or a lone surrogate escape.
 */
const JSONB_ESCAPES =
  /\\(?:\\|u(?:d[89ab][0-9a-f]{2}\\ud[c-f][0-9a-f]{2}|0000|d[89a-f][0-9a-f]{2}))/gi;

/**
 * Makes JSON text acceptable to a PostgreSQL `jsonb` (or `json`) parameter.
 *
 * PostgreSQL rejects two things that `JSON.stringify` legitimately produces: a
 * NUL character (`\u0000`, "unsupported Unicode escape sequence") and a lone
 * UTF-16 surrogate (`\ud800`, "invalid input syntax for type json"). Either one
 * fails the whole `INSERT`, so a single stray character in a payload or error
 * message would lose the entire row. This replaces each with U+FFFD, the
 * Unicode replacement character, in keys and values alike, and leaves every
 * other character and every valid surrogate pair unchanged.
 *
 * The replacement is lossy by design: `jsonb` has no representation for these
 * characters. Use it where keeping the record matters more than those
 * characters, such as audit and dead-letter rows.
 *
 * @param json - JSON text, such as the output of `JSON.stringify`.
 * @returns The same JSON text with the unsupported escapes replaced.
 *
 * @example
 * ```ts
 * toPostgresJson(JSON.stringify({ note: 'a\u0000b' })); // '{"note":"a\\ufffdb"}'
 * ```
 */
export function toPostgresJson(json: string): string {
  return json.replace(JSONB_ESCAPES, (sequence) =>
    sequence === '\\\\' || sequence.length === 12 ? sequence : REPLACEMENT,
  );
}
