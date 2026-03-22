import { QueryOptions } from '@nestjs-pipeline/ddd-core';
import type { ZodObject, ZodRawShape } from 'zod';
import { createExecuteClass } from './createExecute.helper';

export function createQuery<TSchema extends ZodObject<ZodRawShape>>(
  schema: TSchema,
) {
  return createExecuteClass(schema, QueryOptions);
}
