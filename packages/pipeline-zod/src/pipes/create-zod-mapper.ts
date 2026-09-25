/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BadRequestException } from '@nestjs/common';
import type { ZodType } from 'zod';

/** A schema-backed mapper returned by {@link createZodMapper}. */
export interface ZodMapper<TInput, TOutput> {
  /** The schema the mapper parses with, for reuse (e.g. `.extend(...)`). */
  readonly schema: ZodType<TOutput, TInput>;
  /**
   * Parses `input` and returns the schema output, including any `.transform()`.
   *
   * @throws {BadRequestException} When parsing fails, with the same
   *   `{ formErrors, fieldErrors }` body as {@link ZodPipe}.
   */
  map(input: TInput): TOutput;
}

/**
 * Creates a controller-layer mapper that parses input through a Zod schema,
 * typically turning a validated request DTO into an application command.
 *
 * It parses synchronously, so the schema must not use async refinements or
 * transforms; validate those with {@link ZodPipe}, which parses asynchronously.
 * A failure answers HTTP 400 with the same body as `ZodPipe`, so clients see one
 * validation error shape.
 *
 * @param schema - Schema whose output is the mapped value.
 * @returns A {@link ZodMapper} over `schema`.
 *
 * @example Map a DTO to a command
 * ```ts
 * export const CreateUserMapper = createZodMapper(
 *   CreateUserDtoSchema.transform(
 *     ({ name, email }) => new CreateUserCommand({ username: name, email }),
 *   ),
 * );
 *
 * @Post()
 * create(@Body(new ZodPipe(CreateUserDtoSchema)) dto: CreateUserDto) {
 *   return this.commandBus.execute(CreateUserMapper.map(dto));
 * }
 * ```
 */
export function createZodMapper<TInput, TOutput>(
  schema: ZodType<TOutput, TInput>,
): ZodMapper<TInput, TOutput> {
  return {
    schema,
    map(input: TInput): TOutput {
      const result = schema.safeParse(input);
      if (!result.success)
        throw new BadRequestException(result.error.flatten());
      return result.data as TOutput;
    },
  };
}
