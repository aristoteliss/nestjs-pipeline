/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { untyped } from '@cqrs-ddd/untyped';
import { Type } from '@nestjs/common';
import {
  SET_CORRELATION_ID,
  SET_RESPONSE,
  SET_TENANT_ID,
} from './constants/pipeline-context.constants.js';
import {
  type BehaviorId,
  getBehaviorId,
} from './decorators/pipeline.decorator.js';
import { IPipelineBehavior } from './interfaces/pipeline.behavior.interface.js';
import { IPipelineContext } from './interfaces/pipeline.context.interface.js';
import { PipelineHandlerMeta } from './interfaces/pipeline-handler-meta.interface.js';

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
  private _correlationId = '';

  get correlationId(): string {
    return this._correlationId;
  }

  /** @internal Assigns the ID before the behavior chain starts. */
  [SET_CORRELATION_ID](value: string): void {
    this._correlationId = value;
  }

  private _tenantId: string | undefined = undefined;

  /**
   * Active tenant identifier for multi-tenant pipeline executions.
   */
  get tenantId(): string | undefined {
    return this._tenantId;
  }

  /**
   * Assigns the tenant once per execution. A different value after one is set
   * (by the runner, from the tenant source or the enclosing pipeline)
   * throws, so a behavior cannot move an execution to another tenant after an
   * earlier behavior has used it.
   */
  [SET_TENANT_ID](value: string | undefined): void {
    if (this._tenantId !== undefined && this._tenantId !== value) {
      throw new Error(
        'PipelineContext tenantId is already assigned and cannot be changed',
      );
    }
    this._tenantId = value;
  }

  abstract readonly request: TRequest;
  abstract readonly requestType: Type<TRequest>;
  abstract readonly requestName: string;
  abstract readonly handlerType: Type;
  abstract readonly handlerName: string;
  abstract readonly requestKind: 'command' | 'query' | 'event' | 'unknown';

  readonly startedAt: Date;
  /**
   * Bag for sharing arbitrary data between behaviors in the same execution.
   * Supports string and unique symbol keys.
   */
  readonly items: Map<string | symbol, unknown>;

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

  /**
   * Options per behavior for this handler: global `[Behavior, opts]` tuple
   * options, shallowly overridden by the handler's `@UsePipeline` options.
   */
  protected abstract readonly behaviorOptionsMap:
    | Map<BehaviorId, Record<string, unknown>>
    | undefined;

  constructor() {
    this.startedAt = new Date();
    this.items = new Map();
  }

  /**
   * Returns the options for a behavior on this handler: the options from a
   * global `[Behavior, opts]` tuple, shallowly overridden by the options from
   * the handler's `@UsePipeline([Behavior, opts])`.
   */
  getBehaviorOptions<T = Record<string, unknown>>(
    behaviorType: Type,
  ): T | undefined {
    return this.behaviorOptionsMap?.get(
      getBehaviorId(behaviorType as Type<IPipelineBehavior>),
    ) as T | undefined;
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
    | Map<BehaviorId, Record<string, unknown>>
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
