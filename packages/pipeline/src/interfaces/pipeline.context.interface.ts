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

/**
 * Rich context available to every pipeline behavior during execution.
 *
 * Behaviors should type-hint against this **interface** to stay decoupled.
 * The concrete implementation ({@link BasePipelineContext}) provides shared
 * logic; extend it only when you need a custom context variant.
 */
export interface IPipelineContext<TRequest = any, TResponse = any> {
  /**
   * Correlation ID for distributed tracing. Mutable — behaviors may override it.
   *
   * Resolution order (before any behavior runs):
   * 1. Inherited from parent pipeline (saga / nested command via AsyncLocalStorage)
   * 2. `correlationIdFactory` — user-supplied factory from module options
   * 3. Auto-generated `uuidv7()` (timestamp-sortable UUID)
   *
   * Use {@link originalCorrelationId} to access the initial value even after override.
   */
  correlationId: string;

  /**
   * The immutable correlation ID assigned when the pipeline was created.
   * Preserved even if a behavior later overrides {@link correlationId}.
   */
  readonly originalCorrelationId: string;

  /** The command/query/event instance with all its property values. */
  readonly request: TRequest;

  /** The class (constructor) of the command/query/event. */
  readonly requestType: Type<TRequest>;

  /** The class name string, e.g. "CreateUserCommand". */
  readonly requestName: string;

  /** The handler class (constructor) that will process this request. */
  readonly handlerType: Type;

  /** The handler class name string, e.g. "CreateUserHandler". */
  readonly handlerName: string;

  /** 'command', 'query', or 'event' — detected at bootstrap from NestJS metadata. */
  readonly requestKind: 'command' | 'query' | 'event' | 'unknown';

  /** UTC timestamp when the pipeline execution started. */
  readonly startedAt: Date;

  /**
   * The handler's return value, set automatically after the real handler executes.
   * Available to behaviors in their post-`next()` code path.
   * `undefined` before the handler runs or for event handlers that return void.
   */
  readonly response: TResponse | undefined;

  /** Bag for sharing arbitrary data between behaviors in the same execution. */
  readonly items: Map<string, any>;

  /**
   * Retrieve options passed to a specific behavior via @UsePipeline([Behavior, opts]).
   * Returns undefined if no options were provided for that behavior.
   */
  getBehaviorOptions<T = Record<string, any>>(behaviorType: Type): T | undefined;
}
