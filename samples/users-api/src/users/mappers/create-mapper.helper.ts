import { BadRequestException } from '@nestjs/common';
import { z, ZodType } from 'zod';

export function createMapper<TInput, TOutput>(
  schema: ZodType<TOutput, TInput>,
) {
  return {
    schema,
    map(input: TInput): TOutput {
      const result = schema.safeParse(input);
      if (!result.success) throw new BadRequestException(z.treeifyError(result.error));
      return result.data as TOutput;
    },
  };
}
