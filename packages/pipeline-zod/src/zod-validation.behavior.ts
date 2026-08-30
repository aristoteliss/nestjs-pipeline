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

import { Injectable } from '@nestjs/common';
import {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
  untyped,
} from '@nestjs-pipeline/core';
import { ZodType } from 'zod';
import { ZodValidationError } from './errors/zod-validation.error';

/**
 * Conventional property key used to attach a Zod schema to a command, query, or event class.
 *
 * Classes built with `createRequest()` automatically receive this property, so
 * {@link ZodValidationBehavior} can introspect and validate without extra wiring.
 *
 * For manually-written event classes you can attach the schema yourself:
 *
 * @example
 * ```ts
 * import { ZOD_SCHEMA_KEY } from '@nestjs-pipeline/zod';
 * import { z } from 'zod';
 *
 * const userCreatedSchema = z.object({
 *   userId: z.string().uuid(),
 *   username: z.string().min(1),
 *   email: z.string().email(),
 * });
 *
 * export class UserCreatedEvent {
 *   static readonly [ZOD_SCHEMA_KEY] = userCreatedSchema;
 *
 *   constructor(
 *     public readonly userId: string,
 *     public readonly username: string,
 *     public readonly email: string,
 *   ) {}
 * }
 * ```
 */
export const ZOD_SCHEMA_KEY = '_zodSchema' as const;

/** @deprecated Use {@link ZOD_SCHEMA_KEY} instead. */
export const ZOD_SCHEMA = ZOD_SCHEMA_KEY;

/** Whether a parsed value can safely be applied to an existing request instance. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Pipeline behavior that parses the incoming request (command, query, or event)
 * with a Zod schema when one is attached to the request class via the `_zodSchema`
 * static property (set automatically by `createRequest()`).
 *
 * **How it works:**
 * - If `context.requestType._zodSchema` is a `ZodType`, the behavior runs
 *   `schema.safeParseAsync(context.request)`.
 * - On failure it throws {@link ZodValidationError} — catch it with an
 *   `ExceptionFilter` to map it to an HTTP 400.
 * - On success, the parsed result must be a plain object because pipeline
 *   request identity is preserved in-place. Keys omitted by the schema are
 *   deleted and parsed/coerced/defaulted values are assigned before the handler
 *   runs. A top-level transform to an array, primitive, Date, or other
 *   non-record shape is rejected rather than corrupting the request instance.
 * - If no schema is attached (e.g. a plain event class), the behavior is a transparent
 *   no-op and simply calls `next()`.
 *
 * **Registration — globally for all request kinds:**
 * ```ts
 * PipelineModule.forRoot({
 *   globalBehaviors: {
 *     scope: 'all',
 *     before: [ZodValidationBehavior],
 *   },
 * })
 * ```
 *
 * **Registration — per handler only:**
 * ```ts
 * @UsePipeline(ZodValidationBehavior)
 * export class CreateUserHandler implements ICommandHandler<CreateUserCommand> { ... }
 * ```
 */
@Injectable()
export class ZodValidationBehavior implements IPipelineBehavior {
  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const schema = untyped(context.requestType)[ZOD_SCHEMA_KEY] as
      | ZodType
      | undefined;

    if (schema) {
      const result = await schema.safeParseAsync(context.request);
      if (!result.success) {
        throw new ZodValidationError(result.error);
      }

      if (!isPlainObject(result.data)) {
        throw new TypeError(
          'ZodValidationBehavior requires the top-level parsed output to be a plain object so it can be applied to the existing pipeline request instance.',
        );
      }

      if (!context.request || typeof context.request !== 'object') {
        throw new TypeError(
          'ZodValidationBehavior requires the pipeline request to be an object when a schema is attached.',
        );
      }

      for (const key of Object.keys(context.request)) {
        if (Object.getOwnPropertyDescriptor(result.data, key) === undefined) {
          delete (context.request as unknown as Record<string, unknown>)[key];
        }
      }
      defineEnumerableDataProperties(context.request, result.data);
    }

    return next();
  }
}

function defineEnumerableDataProperties(
  target: object,
  source: Record<string, unknown>,
): void {
  for (const key of Object.keys(source)) {
    Object.defineProperty(target, key, {
      value: source[key],
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
}
