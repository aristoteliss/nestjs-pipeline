/* Copyright (C) 2026-present Aristotelis — see repository license. */

export { DEFAULT_CORRELATION_HEADER } from './constants/correlation.constants';
export type { WithCorrelationId } from './correlation.store';
export {
  addCorrelationId,
  correlationHeaders,
  correlationStore,
  getCorrelationId,
  runWithCorrelationId,
} from './correlation.store';
export type {
  CorrelationDecoratorOptions,
  CorrelationExtractor,
} from './decorators/with-correlation.decorator';
export {
  CorrelationFrom,
  WithCorrelation,
} from './decorators/with-correlation.decorator';
export { uuidv7 } from './helpers/uuidv7';
export { HttpCorrelationMiddleware } from './middlewares/http-correlation.middleware';
export type { CorrelationOptions } from './options/correlation.options';
export { CORRELATION_OPTIONS } from './options/correlation.options';
