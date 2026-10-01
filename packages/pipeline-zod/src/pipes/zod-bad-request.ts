/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BadRequestException } from '@nestjs/common';

/**
 * Builds the HTTP 400 answer for failed validation issues: a
 * `BadRequestException` whose body is `{ formErrors, fieldErrors }`, the shape
 * Zod's `flatten()` produces. An issue without a path goes to `formErrors`;
 * any other is listed under the first segment of its path, so errors of nested
 * fields are grouped by their top-level field.
 *
 * Pass it as the `exceptionFactory` of Nest's `StandardSchemaValidationPipe` so
 * that parameters validated with `@Body({ schema })`, `@Param(name, { schema })`
 * or `@Query({ schema })` fail with the same body as {@link createZodMapper}.
 * It accepts the issues of any Standard Schema, and a path segment given as
 * `{ key }` counts by its key.
 *
 * @param issues - The validation issues, in the order the schema reported them.
 * @returns The exception to throw; it does not throw itself.
 *
 * @example
 * ```ts
 * @Module({
 *   providers: [
 *     {
 *       provide: APP_PIPE,
 *       useValue: new StandardSchemaValidationPipe({ exceptionFactory: zodBadRequest }),
 *     },
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
export function zodBadRequest(
  issues: readonly {
    readonly message: string;
    readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[];
  }[],
): BadRequestException {
  const formErrors: string[] = [];
  const fieldErrors: Record<string, string[]> = {};
  for (const { message, path } of issues) {
    const segment = path?.[0];
    if (segment === undefined) {
      formErrors.push(message);
      continue;
    }
    const field = String(typeof segment === 'object' ? segment.key : segment);
    fieldErrors[field] ??= [];
    fieldErrors[field].push(message);
  }
  return new BadRequestException({ formErrors, fieldErrors });
}
