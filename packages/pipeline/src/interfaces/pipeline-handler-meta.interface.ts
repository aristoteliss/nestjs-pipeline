/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Type } from '@nestjs/common';

/**
 * Pre-computed handler metadata, resolved once at bootstrap.
 * Avoids per-request reflection and string operations.
 */
export interface PipelineHandlerMeta {
  readonly handlerType: Type;
  readonly handlerName: string;
  readonly requestKind: 'command' | 'query' | 'event' | 'unknown';
  readonly behaviorOptions?: Map<string, Record<string, unknown>>;
}
