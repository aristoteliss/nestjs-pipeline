import { ZodObject, ZodRawShape, z } from 'zod';
import { ZodValidationError } from '@nestjs-pipeline/zod';

/**
 * Generates a validated Command/Query class from a Zod schema.
 * The returned class:
 *  - Attaches the schema as a static `_zodSchema` property so
 *    {@link ZodValidationBehavior} can re-validate at the pipeline boundary.
 *  - Validates input in the constructor and throws ZodValidationError on failure
 *  - Has all schema fields as typed instance properties (via Object.assign)
 *
 * Usage:
 *   const schema = z.object({ id: z.string().uuid() });
 *   export class DeleteUserCommand extends createRequest(schema) {}
 *   export interface DeleteUserCommand extends z.infer<typeof schema> {}
 */
export function createRequest<T extends ZodRawShape>(schema: ZodObject<T>) {
  type Input = z.infer<ZodObject<T>>;

  return class {
    /** Attached so ZodValidationBehavior can discover and validate the schema. */
    static readonly _zodSchema = schema;

    constructor(input: Input) {
      const result = schema.safeParse(input);
      if (!result.success) throw new ZodValidationError(result.error);
      Object.assign(this, result.data);
    }
  };
}
