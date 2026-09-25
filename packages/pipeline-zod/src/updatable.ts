/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { registry, type ZodType } from 'zod';

/**
 * The fields marked with {@link updatable}. A private registry rather than
 * `.meta()`, so the mark never appears in `z.toJSONSchema()` output and no
 * other library can set or clear it.
 */
const updatableFields = registry<{ readonly updatable: true }>();

interface WrapperDef {
  readonly type: string;
  readonly innerType?: ZodType;
  readonly in?: ZodType;
  readonly out?: ZodType;
  readonly shape?: Record<string, ZodType>;
}

const defOf = (schema: ZodType) => schema._zod.def as unknown as WrapperDef;

/**
 * Marks a command field as updatable: a change the command requests, which
 * field-level authorization must check.
 *
 * {@link createCommand} lists the marked fields of the top-level object as
 * the class's static `updatableFields`, the list of fields to pass to
 * field-level authorization. A field without the mark is never in that list,
 * so mark every field the handler writes.
 *
 * The mark survives the checks and wrappers chained after it (`.min()`,
 * `.optional()`, `.nullable()`, `.default()`, `.transform()`) and
 * `.partial()` on the object. It is set on a copy, so a schema shared with
 * other commands stays unmarked.
 *
 * @param schema - The field schema to mark.
 * @returns A marked copy of `schema`, with the same type.
 *
 * @example
 * ```ts
 * export class UpdateRoleCommand extends createCommand(
 *   z.object({
 *     id: z.uuid(),
 *     name: z.string().trim().apply(updatable).min(3),
 *   }),
 * ) {}
 *
 * UpdateRoleCommand.updatableFields; // ['name']
 * ```
 */
export function updatable<TSchema extends ZodType>(schema: TSchema): TSchema {
  const marked = schema.clone();
  updatableFields.add(marked, { updatable: true });
  return marked;
}

function isMarked(schema: ZodType): boolean {
  if (updatableFields.get(schema)?.updatable) return true;
  const def = defOf(schema);
  if (def.type === 'pipe') {
    return isMarked(def.in as ZodType) || isMarked(def.out as ZodType);
  }
  return def.innerType !== undefined && isMarked(def.innerType);
}

function objectShape(schema: ZodType): Record<string, ZodType> | undefined {
  const def = defOf(schema);
  if (def.type === 'object') return def.shape;
  if (def.type === 'pipe') return objectShape(def.in as ZodType);
  return undefined;
}

/**
 * Lists the fields of an object schema marked with {@link updatable}, in
 * shape order.
 *
 * Only the top-level object is read, also through a top-level `.transform()`
 * or `.pipe()`: a mark inside a nested object, an array or a union is not
 * listed. Any other schema has no updatable fields.
 *
 * @param schema - A command schema, usually a `z.object()`.
 * @returns The marked field names, frozen.
 */
export function updatableFieldsOf(schema: ZodType): readonly string[] {
  const shape = objectShape(schema) ?? {};
  return Object.freeze(
    Object.keys(shape).filter((key) => isMarked(shape[key] as ZodType)),
  );
}
