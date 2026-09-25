/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Defines a non-enumerable property, excluded from `toJSON()` and payload spreads. */
export function defineHidden(
  target: object,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, { value, enumerable: false });
}

/** Returns the enumerable own fields of a request whose value is not `undefined`. */
export function definedFields(request: object): Record<string, unknown> {
  const json: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(request)) {
    if (value !== undefined) {
      json[key] = value;
    }
  }
  return json;
}
