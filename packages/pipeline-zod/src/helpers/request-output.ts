/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

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
  source: 'constructor' | 'behavior',
): asserts value is Record<string, unknown> {
  if (isPlainRequestOutput(value)) return;
  throw new TypeError(
    `${source === 'constructor' ? 'createZodRequest' : 'ZodValidationBehavior'} requires the top-level parsed output to be a plain object so it can be applied to the existing pipeline request instance.`,
  );
}
