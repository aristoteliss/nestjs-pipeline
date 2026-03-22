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
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { Type } from '@nestjs/common';
import {
  pipelineStore,
  SET_ORIGINAL_CORRELATION_ID,
  SET_RESPONSE,
} from './constants/pipeline-context.constants';
import { IPipelineContext } from './interfaces/pipeline.context.interface';
import { PipelineHandlerMeta } from './interfaces/pipeline-handler-meta.interface';
import { untyped } from './types/safe-typing';

/**
 * Abstract base class with shared implementation for all pipeline contexts.
 *
 * Provides default implementations for:
 * - `getBehaviorOptions()` — reads from the pre-computed options map
 * - `response` — readonly holder for the handler's return value (set via Symbol)
 * - Common fields (correlationId, startedAt, items)
 *
 * Extend this class to create custom context variants for specialized pipelines.
 * Behaviors should still type-hint against {@link IPipelineContext} (the interface).
 */
export abstract class BasePipelineContext<
  TRequest = unknown,
  TResponse = unknown,
> implements IPipelineContext<TRequest, TResponse>
{
  correlationId: string;

  /** Backing field for `originalCorrelationId`. */
  private _originalCorrelationId = '';

  /**
   * The immutable correlation ID assigned when the pipeline was created.
   * Preserved even if a behavior later overrides `correlationId`.
   */
  get originalCorrelationId(): string {
    return this._originalCorrelationId;
  }

  /**
   * Symbol-keyed setter — only callable by code that imports {@link SET_ORIGINAL_CORRELATION_ID}.
   * Locks the original value so behaviors cannot tamper with it.
   */
  [SET_ORIGINAL_CORRELATION_ID](value: string): void {
    this._originalCorrelationId = value;
  }

  abstract readonly request: TRequest;
  abstract readonly requestType: Type<TRequest>;
  abstract readonly requestName: string;
  abstract readonly handlerType: Type;
  abstract readonly handlerName: string;
  abstract readonly requestKind: 'command' | 'query' | 'event' | 'unknown';

  readonly startedAt: Date;
  readonly items: Map<string, unknown>;

  /** Backing field for `response` — only writable via `[SET_RESPONSE]()`. */
  private _response: TResponse | undefined = undefined;

  /** The handler's return value. Read-only for behaviors. */
  get response(): TResponse | undefined {
    return this._response;
  }

  /**
   * Symbol-keyed setter — only callable by code that imports {@link SET_RESPONSE}.
   * This keeps `response` effectively readonly for behaviors.
   */
  [SET_RESPONSE](value: TResponse | undefined): void {
    this._response = value;
  }

  /** Behavior options map — populated from @UsePipeline metadata. */
  protected abstract readonly behaviorOptionsMap:
    | Map<string, Record<string, unknown>>
    | undefined;

  constructor() {
    this.correlationId = '';
    this.startedAt = new Date();
    this.items = new Map();

    // Inherit correlationId from parent pipeline context (saga / nested command)
    const parent = pipelineStore.getStore();
    if (parent?.correlationId) {
      this.correlationId = parent.correlationId;
    }
  }

  /**
   * Retrieve options passed to a specific behavior via @UsePipeline([Behavior, opts]).
   */
  getBehaviorOptions<T = Record<string, unknown>>(
    behaviorType: Type,
  ): T | undefined {
    return this.behaviorOptionsMap?.get(behaviorType.name) as T | undefined;
  }
}

/**
 * Concrete pipeline context created per request.
 * Pre-computed handler metadata is injected via {@link PipelineHandlerMeta}.
 */
export class PipelineContext<
  TRequest = unknown,
  TResponse = unknown,
> extends BasePipelineContext<TRequest, TResponse> {
  readonly requestType: Type<TRequest>;
  readonly requestName: string;
  readonly handlerType: Type;
  readonly handlerName: string;
  readonly requestKind: 'command' | 'query' | 'event' | 'unknown';

  protected readonly behaviorOptionsMap:
    | Map<string, Record<string, unknown>>
    | undefined;

  constructor(
    readonly request: TRequest,
    meta: PipelineHandlerMeta,
  ) {
    super();
    this.requestType = untyped(request).constructor as Type<TRequest>;
    this.requestName = this.requestType.name;
    this.handlerType = meta.handlerType;
    this.handlerName = meta.handlerName;
    this.requestKind = meta.requestKind;
    this.behaviorOptionsMap = meta.behaviorOptions;
  }
}
