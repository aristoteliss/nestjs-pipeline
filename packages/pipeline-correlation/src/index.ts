/* Copyright (C) 2026-present Aristotelis — see repository license. */

export { DEFAULT_CORRELATION_HEADER } from './constants/correlation.constants.js';
export type { WithCorrelationId } from './correlation.store.js';
export {
  addCorrelationId,
  correlationHeaders,
  correlationSource,
  getCorrelationId,
  runWithCorrelationId,
} from './correlation.store.js';
export type {
  CorrelationDecoratorOptions,
  CorrelationExtractor,
} from './decorators/with-correlation.decorator.js';
export {
  CorrelationFrom,
  WithCorrelation,
} from './decorators/with-correlation.decorator.js';
export { HttpCorrelationMiddleware } from './middlewares/http-correlation.middleware.js';
export type { CorrelationOptions } from './options/correlation.options.js';
export {
  CORRELATION_OPTIONS,
  DEFAULT_CORRELATION_ID_MAX_LENGTH,
  DEFAULT_CORRELATION_ID_PATTERN,
} from './options/correlation.options.js';
