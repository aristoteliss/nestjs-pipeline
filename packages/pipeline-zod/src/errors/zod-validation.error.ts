/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ZodError } from 'zod';

/**
 * Thrown when a command, query, or event fails Zod validation: by
 * {@link ZodValidationBehavior}, and by the constructor, `parse()`, and
 * `parseAsync()` of a class generated with {@link createZodRequest}.
 *
 * This is framework-agnostic — it carries serializable `details` so the HTTP
 * layer (or any transport layer) can map it to the appropriate response format.
 *
 * Register the exported {@link ZodValidationFilter} to map it to HTTP 400.
 */
export class ZodValidationError extends Error {
  /** Structured details from {@link ZodError.flatten}. */
  public readonly details: ReturnType<ZodError['flatten']>;

  constructor(error: ZodError) {
    super('Validation failed');
    this.name = 'ZodValidationError';
    this.details = error.flatten();
  }
}
