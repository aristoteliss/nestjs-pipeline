/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Returns the first non-empty value of an incoming HTTP header. */
export function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === 'string' && single.length > 0 ? single : undefined;
}
