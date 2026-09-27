/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Returns the first value of an incoming HTTP header, or `undefined` when the
 * header is missing or that first value is empty.
 *
 * @example
 * ```ts
 * firstHeaderValue(req.headers['x-api-id']); // 'reporting-service'
 * firstHeaderValue(['first', 'second']); // 'first'
 * firstHeaderValue(''); // undefined
 * ```
 */
export function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === 'string' && single.length > 0 ? single : undefined;
}
