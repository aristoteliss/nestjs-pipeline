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
import { ZodError } from 'zod';

/**
 * Thrown by {@link ZodValidationBehavior} when a command, query, or event
 * fails pipeline-level Zod validation.
 *
 * This is framework-agnostic — it carries serializable `details` so the HTTP
 * layer (or any transport layer) can map it to the appropriate response format.
 *
 * In an Express/Fastify NestJS app, catch it with an `ExceptionFilter` and
 * map it to a 400 Bad Request response, for example:
 *
 * @example
 * ```ts
 * @Catch(ZodValidationError)
 * export class ZodValidationFilter implements ExceptionFilter {
 *   catch(exception: ZodValidationError, host: ArgumentsHost) {
 *     const res = host.switchToHttp().getResponse();
 *     res.status(400).json({
 *       statusCode: 400,
 *       error: 'Bad Request',
 *       message: exception.message,
 *       details: exception.details,
 *     });
 *   }
 * }
 * ```
 */
export class ZodValidationError extends Error {
  /** Structured details from {@link ZodError.flatten}. */
  public readonly details: ReturnType<ZodError['flatten']>;

  constructor(error: ZodError) {
    super('Validation failed');
    this.name = 'ZodValidationError';
    this.details = error.flatten();
  }
}
