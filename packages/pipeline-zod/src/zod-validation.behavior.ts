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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
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

/**
 * Pipeline behavior that validates the incoming request (command, query, or event)
 * against a Zod schema when one is attached to the request class via the `_zodSchema`
 * static property (set automatically by `createRequest()`).
 *
 * **How it works:**
 * - If `context.requestType._zodSchema` is a `ZodType`, the behavior runs
 *   `schema.safeParse(context.request)`.
 * - On failure it throws {@link ZodValidationError} — catch it with an
 *   `ExceptionFilter` to map it to an HTTP 400.
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
 * @UsePipeline([ZodValidationBehavior])
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
      const result = schema.safeParse(context.request);
      if (!result.success) {
        throw new ZodValidationError(result.error);
      }
    }

    return next();
  }
}
