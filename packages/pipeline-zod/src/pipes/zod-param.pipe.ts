/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';

/**
 * NestJS pipe that validates and transforms route parameters, query values, or
 * request bodies through a Zod schema.
 *
 * The pipe uses `safeParseAsync`, so async refinements/transforms are supported.
 * Validation failures are mapped directly to Nest {@link BadRequestException};
 * use {@link ZodValidationBehavior} when you want the framework-neutral
 * `ZodValidationError` pipeline contract instead.
 *
 * @typeParam TOutput - Parsed value returned to the controller parameter.
 * @typeParam TInput - Raw value received from Nest.
 *
 * @example Route parameter
 * ```ts
 * @Get(':id')
 * getUser(@Param('id', new ZodPipe(UserIdDtoSchema)) id: string) {}
 * ```
 *
 * @example Validate a request DTO before mapping it to an application command
 * ```ts
 * @Post()
 * async create(
 *   @Body(new ZodPipe(CreateUserDtoSchema)) dto: CreateUserDto,
 * ) {
 *   return this.commandBus.execute(CreateUserMapper.map(dto));
 * }
 * ```
 */
export class ZodPipe<TOutput, TInput = unknown>
  implements PipeTransform<TInput, Promise<TOutput>>
{
  /**
   * @param schema - Zod schema used to parse/transform the incoming value.
   */
  constructor(private readonly schema: ZodType<TOutput, TInput>) {}

  /**
   * @param value - Raw controller argument supplied by Nest.
   * @returns The parsed/transformed schema output.
   * @throws {BadRequestException} When Zod validation fails.
   */
  async transform(value: TInput): Promise<TOutput> {
    const result = await this.schema.safeParseAsync(value);
    if (!result.success) throw new BadRequestException(result.error.flatten());
    return result.data as TOutput;
  }
}
