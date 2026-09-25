/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  createCommand,
  createQuery,
  createZodRequest,
  type InferInput,
  type InferOutput,
  type ZodCommandClass,
  type ZodQueryClass,
  type ZodRequestClass,
} from './create-zod-request';
export { ZodValidationError } from './errors/zod-validation.error';
export { ZodValidationFilter } from './filters/zod-validation.filter';
export { createZodMapper, type ZodMapper } from './pipes/create-zod-mapper';
export { ZodPipe } from './pipes/zod-param.pipe';
export {
  getRawInput,
  getValidatedData,
  ZOD_RAW_INPUT_KEY,
  ZOD_SCHEMA_KEY,
  ZOD_VALIDATED_DATA_KEY,
  ZodValidationBehavior,
} from './zod-validation.behavior';
