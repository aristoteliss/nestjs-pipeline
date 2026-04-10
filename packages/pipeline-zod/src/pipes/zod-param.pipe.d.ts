import { PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';
/**
 * A reusable NestJS pipe that validates any value (route param, body, query)
 * against a Zod schema — including transform schemas (e.g. mappers).
 *
 *   @Param('id', new ZodPipe<UserIdDto, string>(UserIdDtoSchema))
 *   @Body(new ZodPipe(CreateUserDtoSchema))
 *   @Body(new ZodPipe(CreateUserMapper))   // transform schema → outputs a Command
 */
export declare class ZodPipe<TOutput, TInput = unknown>
  implements PipeTransform<TInput, TOutput>
{
  private readonly schema;
  constructor(schema: ZodType<TOutput>);
  transform(value: TInput): TOutput;
}
//# sourceMappingURL=zod-param.pipe.d.ts.map
