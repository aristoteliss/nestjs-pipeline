/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  type AbstractConstructor,
  createCommand,
  createQuery,
  createZodRequest,
  type InferInput,
  type InferOutput,
  type ZodCommandClass,
  type ZodQueryClass,
  type ZodRequestClass,
} from './create-zod-request.js';
export { ZodValidationError } from './errors/zod-validation.error.js';
export { ZodValidationFilter } from './filters/zod-validation.filter.js';
export { createZodMapper, type ZodMapper } from './pipes/create-zod-mapper.js';
export { zodBadRequest } from './pipes/zod-bad-request.js';
export { updatable, updatableFieldsOf } from './updatable.js';
export {
  getRawInput,
  getValidatedData,
  ZOD_RAW_INPUT_KEY,
  ZOD_SCHEMA_KEY,
  ZOD_VALIDATED_DATA_KEY,
  ZodValidationBehavior,
} from './zod-validation.behavior.js';
