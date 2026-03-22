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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
 */

import { ZodValidationError } from '@nestjs-pipeline/zod';
import type { ZodObject, ZodRawShape, z } from 'zod';

type RequestClass<TSchema extends ZodObject<ZodRawShape>> = {
  new (input: z.input<TSchema>): z.output<TSchema>;
  readonly _zodSchema: TSchema;
};

/**
 * Generates a validated Command/Query class from a Zod schema.
 * The returned class:
 *  - Attaches the schema as a static `_zodSchema` property so
 *    {@link ZodValidationBehavior} can re-validate at the pipeline boundary.
 *  - Validates input in the constructor and throws ZodValidationError on failure
 *  - Has all schema fields as typed instance properties (via Object.assign)
 *
 * Usage:
 *   const schema = z.object({ id: z.string().uuid() });
 *   export class DeleteUserCommand extends createRequest(schema) {}
 */
export function createRequest<TSchema extends ZodObject<ZodRawShape>>(
  schema: TSchema,
): RequestClass<TSchema> {
  type Input = z.input<TSchema>;

  class Request {
    /** Attached so ZodValidationBehavior can discover and validate the schema. */
    static readonly _zodSchema = schema;

    constructor(input: Input) {
      const result = schema.safeParse(input);
      if (!result.success) throw new ZodValidationError(result.error);
      Object.assign(this, result.data);
    }
  }

  return Request as RequestClass<TSchema>;
}
