/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { createCommand, createQuery } from './create-zod-request';
import { updatable, updatableFieldsOf } from './updatable';

describe('updatable', () => {
  it('lists the marked fields of a command in shape order, and only those', () => {
    class UpdateUserCommand extends createCommand(
      z.object({
        id: z.uuid(),
        username: z.string().trim().apply(updatable).min(3).optional(),
        email: z.email().optional(),
        department: updatable(z.string().trim().min(3)).nullable().optional(),
      }),
    ) {}

    expect(UpdateUserCommand.updatableFields).toEqual([
      'username',
      'department',
    ]);
    expectTypeOf(UpdateUserCommand.updatableFields).toEqualTypeOf<
      readonly ('id' | 'username' | 'email' | 'department')[]
    >();
  });

  it.each([
    ['before the checks', z.string().apply(updatable).trim().min(3)],
    ['between the checks', z.string().trim().apply(updatable).min(3)],
    ['after the checks', z.string().trim().min(3).apply(updatable)],
    ['as a function', updatable(z.string().trim().min(3))],
    ['under .optional()', z.string().apply(updatable).min(3).optional()],
    ['under .nullable()', z.string().apply(updatable).nullable()],
    ['under .nullish()', z.string().apply(updatable).nullish()],
    ['under .default()', z.string().apply(updatable).default('x')],
    ['under .readonly()', z.string().apply(updatable).readonly()],
    ['under .catch()', z.string().apply(updatable).catch('x')],
    [
      'under .transform()',
      z
        .string()
        .apply(updatable)
        .transform((value) => value.length),
    ],
    ['as the target of .pipe()', z.string().pipe(updatable(z.string()))],
  ])('finds a mark placed %s', (_label, field) => {
    expect(updatableFieldsOf(z.object({ id: z.uuid(), field }))).toEqual([
      'field',
    ]);
  });

  it('keeps the marks through object refinements and derivations', () => {
    const base = z.object({
      id: z.uuid(),
      name: z.string().apply(updatable),
      note: z.string(),
    });

    expect(updatableFieldsOf(base.refine(() => true))).toEqual(['name']);
    expect(updatableFieldsOf(base.partial())).toEqual(['name']);
    expect(updatableFieldsOf(base.partial().required())).toEqual(['name']);
    expect(updatableFieldsOf(base.pick({ id: true, name: true }))).toEqual([
      'name',
    ]);
    expect(updatableFieldsOf(base.omit({ name: true }))).toEqual([]);
    expect(
      updatableFieldsOf(
        base.extend({ tag: z.string().apply(updatable) }).strict(),
      ),
    ).toEqual(['name', 'tag']);
    expect(updatableFieldsOf(base.transform((value) => value))).toEqual([
      'name',
    ]);
  });

  it('marks a copy, so a schema shared with another command stays unmarked', () => {
    const name = z.string().trim().min(3);

    class RenameCommand extends createCommand(
      z.object({ name: updatable(name) }),
    ) {}
    class CreateCommand extends createCommand(z.object({ name })) {}

    expect(RenameCommand.updatableFields).toEqual(['name']);
    expect(CreateCommand.updatableFields).toEqual([]);
  });

  it('reads the top-level object only', () => {
    expect(
      updatableFieldsOf(
        z.object({
          address: z.object({ city: z.string().apply(updatable) }),
          tags: z.array(z.string().apply(updatable)),
          either: z.union([z.string().apply(updatable), z.number()]),
        }),
      ),
    ).toEqual([]);
    expect(updatableFieldsOf(z.string().apply(updatable))).toEqual([]);
  });

  it('leaves validation, output and JSON Schema unchanged', () => {
    const plain = z.string().trim().min(3);
    const marked = z.string().trim().min(3).apply(updatable);

    expect(marked.parse('  admins ')).toBe('admins');
    expect(marked.safeParse('ab').success).toBe(false);
    expect(z.toJSONSchema(marked)).toEqual(z.toJSONSchema(plain));
  });

  it('exposes a frozen, read-only list on commands and none on queries', () => {
    class UpdateRoleCommand extends createCommand(
      z.object({ id: z.uuid(), name: z.string().apply(updatable) }),
    ) {}
    class GetRoleQuery extends createQuery(z.object({ id: z.uuid() })) {}

    expect(Object.isFrozen(UpdateRoleCommand.updatableFields)).toBe(true);
    expect(() => {
      (UpdateRoleCommand as { updatableFields: unknown }).updatableFields = [];
    }).toThrow(TypeError);
    expect('updatableFields' in GetRoleQuery).toBe(false);
  });
});
