import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';

/**
 * A reusable NestJS pipe that validates any value (route param, body, query)
 * against a Zod schema — including transform schemas (e.g. mappers).
 *
 *   @Param('id', new ZodPipe<UserIdDto, string>(UserIdDtoSchema))
 *   @Body(new ZodPipe(CreateUserDtoSchema))
 *   @Body(new ZodPipe(CreateUserMapper))   // transform schema → outputs a Command
 */
export class ZodPipe<TOutput, TInput = any> implements PipeTransform<TInput, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: TInput): TOutput {
    const result = this.schema.safeParse(value);
    if (!result.success) throw new BadRequestException(result.error.flatten());
    return result.data as TOutput;
  }
}
