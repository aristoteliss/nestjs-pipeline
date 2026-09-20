/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Returns true when a parsed top-level value can be applied in-place to a CQRS request instance. */
export function isPlainRequestOutput(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Pipeline Zod requests preserve the original class instance, so a top-level
 * schema transform must still produce a plain record. Arrays, primitives, Date,
 * Map, class instances, etc. cannot be copied onto that instance faithfully.
 *
 * Keeping this assertion shared between the generated request constructor and
 * {@link ZodValidationBehavior} prevents the two validation paths from accepting
 * different top-level output shapes.
 */
export function assertPlainRequestOutput(
  value: unknown,
  source: 'constructor' | 'parseAsync' | 'behavior',
): asserts value is Record<string, unknown> {
  if (isPlainRequestOutput(value)) return;
  throw new TypeError(
    `${source === 'behavior' ? 'ZodValidationBehavior' : `createZodRequest.${source}`} requires the top-level parsed output to be a plain object so it can be applied to the existing pipeline request instance.`,
  );
}

/** Applies every parsed own enumerable key, including explicit undefined. */
export function defineEnumerableDataProperties(
  target: object,
  source: Record<string, unknown>,
): void {
  for (const key of Object.keys(source)) {
    Object.defineProperty(target, key, {
      value: source[key],
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
}
