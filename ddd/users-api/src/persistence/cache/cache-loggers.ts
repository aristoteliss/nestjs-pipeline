/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Logger } from '@nestjs/common';

/**
 * Nest loggers for the ddd-core cache decorators. They route cache warnings through
 * the application logger (Pino at runtime) instead of the decorators' default
 * `console.warn`.
 */
export const cacheWriteLogger = new Logger('CacheDecorator');
export const cacheReadLogger = new Logger('FromCacheDecorator');
