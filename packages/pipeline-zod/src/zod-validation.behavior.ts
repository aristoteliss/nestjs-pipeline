/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Injectable } from '@nestjs/common';
import {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
  untyped,
} from '@nestjs-pipeline/core';
import { ZodType } from 'zod';
import { ZodValidationError } from './errors/zod-validation.error';
import {
  assertPlainRequestOutput,
  defineEnumerableDataProperties,
} from './helpers/request-output';
import {
  getRawInput,
  getValidatedData,
  getValidationState,
  hasBeenMutated,
  setValidatedData,
  ZOD_RAW_INPUT_KEY,
  ZOD_VALIDATED_DATA_KEY,
} from './helpers/zod-data.helpers';

export {
  getRawInput,
  getValidatedData,
  ZOD_RAW_INPUT_KEY,
  ZOD_VALIDATED_DATA_KEY,
};

/**
 * Conventional property key used to attach a Zod schema to a command, query, or event class.
 *
 * Classes built with `createCommand()`, `createQuery()`, or `createZodRequest()` automatically receive this property, so
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

/**
 * Pipeline behavior that parses the incoming request (command, query, or event)
 * with a Zod schema when one is attached to the request class via the `_zodSchema`
 * static property (set automatically by `createCommand()`, `createQuery()`, or `createZodRequest()`).
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
    const schema = context.requestType
      ? (untyped(context.requestType)[ZOD_SCHEMA_KEY] as ZodType | undefined)
      : undefined;

    if (!schema) return next();
    if (!context.request || typeof context.request !== 'object') {
      throw new TypeError(
        'ZodValidationBehavior requires the pipeline request to be an object when a schema is attached.',
      );
    }
    const request = context.request as Record<string, unknown>;
    const state = getValidationState(request);
    if (state?.schema === schema && !hasBeenMutated(request, state.snapshot))
      return next();

    const result = await schema.safeParseAsync(request);
    if (!result.success) throw new ZodValidationError(result.error);
    assertPlainRequestOutput(result.data, 'behavior');

    // A previously parsed request only gives up the fields its schema produced;
    // an unvalidated one gives up every field the schema does not keep.
    const removable = state
      ? Object.keys(state.snapshot)
      : Object.keys(request);
    for (const key of removable) {
      if (!Object.hasOwn(result.data, key)) delete request[key];
    }
    defineEnumerableDataProperties(request, result.data);
    setValidatedData(request, schema, result.data);

    return next();
  }
}
