/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------

 */

export type { WithCorrelationId } from './correlation.store';
export {
  addCorrelationId,
  correlationHeaders,
  correlationStore,
  getCorrelationId,
  runWithCorrelationId,
  setCorrelationFallback,
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
