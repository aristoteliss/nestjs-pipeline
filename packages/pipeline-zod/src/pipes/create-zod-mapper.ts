/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ZodType } from 'zod';
import { zodBadRequest } from './zod-bad-request.js';

/** A schema-backed mapper returned by {@link createZodMapper}. */
export interface ZodMapper<TInput, TOutput> {
  /** The schema the mapper parses with, for reuse (e.g. `.extend(...)`). */
  readonly schema: ZodType<TOutput, TInput>;
  /**
   * Parses `input` and returns the schema output, including any `.transform()`.
   *
   * @throws {BadRequestException} When parsing fails, with the
   *   `{ formErrors, fieldErrors }` body of {@link zodBadRequest}.
   */
  map(input: TInput): TOutput;
}

/**
 * Creates a controller-layer mapper that parses input through a Zod schema,
 * typically turning a validated request DTO into an application command.
 *
 * It parses synchronously, so the schema must not use async refinements or
 * transforms; declare those as a route parameter's `schema`, which Nest's
 * `StandardSchemaValidationPipe` parses asynchronously. A failure answers HTTP
 * 400 with the body that pipe gives with {@link zodBadRequest} as its
 * `exceptionFactory`, so clients see one validation error shape.
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
 * create(@Body({ schema: CreateUserDtoSchema }) dto: CreateUserDto) {
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
      if (!result.success) throw zodBadRequest(result.error.issues);
      return result.data as TOutput;
    },
  };
}
