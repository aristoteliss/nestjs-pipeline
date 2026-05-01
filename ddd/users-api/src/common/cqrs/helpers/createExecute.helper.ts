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

import { ZodValidationError } from '@nestjs-pipeline/zod';
import type { ZodObject, ZodRawShape, z } from 'zod';

type AbstractConstructor<T = object> = abstract new (...args: never[]) => T;

type ExecuteClass<
  TSchema extends ZodObject<ZodRawShape>,
  TBase extends AbstractConstructor,
> = {
  new(
    input: z.input<TSchema>,
    ...baseArgs: ConstructorParameters<TBase>
  ): InstanceType<TBase> & z.output<TSchema>;
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
 *   export class DeleteUserCommand extends createExecuteClass(schema) {}
 *
 * With base options:
 *   export class GetUserQuery extends createExecuteClass(schema, QueryOptions) {}
 */
export function createExecuteClass<
  TSchema extends ZodObject<ZodRawShape>,
  TBase extends AbstractConstructor = AbstractConstructor,
>(schema: TSchema, Base?: TBase): ExecuteClass<TSchema, TBase> {
  type Input = z.input<TSchema>;
  const Parent = (Base ?? class { }) as new (...args: unknown[]) => object;

  class Execute extends Parent {
    /** Attached so ZodValidationBehavior can discover and validate the schema. */
    static readonly _zodSchema = schema;

    constructor(input: Input, ...baseArgs: unknown[]) {
      super(...baseArgs);

      const result = schema.safeParse(input);
      if (!result.success) throw new ZodValidationError(result.error);
      Object.assign(this, result.data);
    }
  }

  return Execute as unknown as ExecuteClass<TSchema, TBase>;
}
