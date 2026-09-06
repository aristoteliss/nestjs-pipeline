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

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createCommand,
  createQuery,
  createZodRequest,
  type InferInput,
  type InferOutput,
} from './create-zod-request';
import { ZodValidationError } from './errors/zod-validation.error';
import { ZOD_SCHEMA_KEY } from './zod-validation.behavior';

describe('createZodRequest', () => {
  const testSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(3),
    age: z.number().optional(),
  });

  class BaseTestClass {
    constructor(
      public readonly sessionUser?: { id: string },
      public readonly options?: { hydrate?: boolean },
    ) {}

    readonly metadata = 'base-meta';
  }

  it('generates a class with static _zodSchema and schema attached', () => {
    class TestCommand extends createZodRequest(testSchema) {}
    expect(TestCommand[ZOD_SCHEMA_KEY]).toBe(testSchema);
    expect(TestCommand.schema).toBe(testSchema);
  });

  it('instantiates valid payload and assigns fields to instance', () => {
    class TestCommand extends createZodRequest(testSchema) {}
    const cmd = new TestCommand({
      id: '019728a3-7f4a-7000-8000-000000000000',
      name: 'John Doe',
      age: 30,
    });

    expect(cmd.id).toBe('019728a3-7f4a-7000-8000-000000000000');
    expect(cmd.name).toBe('John Doe');
    expect(cmd.age).toBe(30);
    expect(cmd).toBeInstanceOf(TestCommand);
  });

  it('omits undefined optional keys from instance', () => {
    class TestCommand extends createZodRequest(testSchema) {}
    const cmd = new TestCommand({
      id: '019728a3-7f4a-7000-8000-000000000000',
      name: 'John Doe',
    });

    expect(cmd.age).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(cmd, 'age')).toBeUndefined();
  });

  it('throws ZodValidationError when input validation fails', () => {
    class TestCommand extends createZodRequest(testSchema) {}

    expect(
      () =>
        new TestCommand({
          id: 'invalid-uuid',
          name: 'ab',
        }),
    ).toThrow(ZodValidationError);
  });

  it('inherits from base class and forwards base constructor arguments', () => {
    class TestCommandWithBase extends createZodRequest(
      testSchema,
      BaseTestClass,
    ) {}

    const cmd = new TestCommandWithBase(
      {
        id: '019728a3-7f4a-7000-8000-000000000000',
        name: 'Alice',
      },
      { id: 'usr_123' },
      { hydrate: true },
    );

    expect(cmd.metadata).toBe('base-meta');
    expect(cmd.sessionUser).toEqual({ id: 'usr_123' });
    expect(cmd.options).toEqual({ hydrate: true });
    expect(cmd).toBeInstanceOf(BaseTestClass);
    expect(cmd).toBeInstanceOf(TestCommandWithBase);
  });

  it('supports superRefine effects schema', () => {
    const refinedSchema = z
      .object({
        userId: z.string().optional(),
        email: z.string().optional(),
      })
      .superRefine((val, ctx) => {
        if (!val.userId && !val.email) {
          ctx.addIssue({
            code: 'custom',
            message: 'Must provide userId or email',
          });
        }
      });

    class QueryWithRefine extends createZodRequest(refinedSchema) {}

    expect(() => new QueryWithRefine({})).toThrow(ZodValidationError);

    const valid = new QueryWithRefine({ userId: 'u1' });
    expect(valid.userId).toBe('u1');
  });

  it('safely defines own enumerable properties with [[DefineOwnProperty]] semantics even if base class has a getter', () => {
    class BaseWithGetter {
      get name(): string {
        return 'prototype-getter-value';
      }
    }

    class TestCommandWithGetterBase extends createCommand(
      testSchema,
      BaseWithGetter,
    ) {}

    const cmd = new TestCommandWithGetterBase({
      id: '019728a3-7f4a-7000-8000-000000000000',
      name: 'Own Property Value',
    });

    // Ensures own property is defined directly on instance, not hitting prototype getter
    expect(cmd.name).toBe('Own Property Value');
    const descriptor = Object.getOwnPropertyDescriptor(cmd, 'name');
    expect(descriptor).toBeDefined();
    expect(descriptor?.enumerable).toBe(true);
    expect(descriptor?.value).toBe('Own Property Value');

    // Ensures JSON serialization and idempotency fingerprints only contain own enumerable properties
    const json = JSON.parse(JSON.stringify(cmd));
    expect(json).toEqual({
      id: '019728a3-7f4a-7000-8000-000000000000',
      name: 'Own Property Value',
    });
  });

  it('forwards Standard Schema specification (~standard) for NestJS 12', () => {
    class TestCommand extends createCommand(testSchema) {}
    const standard = (TestCommand as unknown as Record<string, unknown>)[
      '~standard'
    ] as { version: number; vendor: string } | undefined;

    expect(standard).toBeDefined();
    expect(standard?.version).toBe(1);
    expect(standard?.vendor).toBe('zod');
  });

  it('provides static parse() and safeParse() on generated classes', () => {
    class TestCommand extends createCommand(testSchema) {}

    const parsed = TestCommand.parse({
      id: '019728a3-7f4a-7000-8000-000000000000',
      name: 'Parsed User',
    });
    expect(parsed).toBeInstanceOf(TestCommand);
    expect(parsed.name).toBe('Parsed User');

    const successResult = TestCommand.safeParse({
      id: '019728a3-7f4a-7000-8000-000000000000',
      name: 'Safe User',
    });
    expect(successResult.success).toBe(true);

    const failResult = TestCommand.safeParse({ id: 'invalid' });
    expect(failResult.success).toBe(false);
  });

  it('infers input and output types with InferInput and InferOutput', () => {
    class TestCommand extends createCommand(testSchema) {}

    type TestInput = InferInput<typeof TestCommand>;
    type TestOutput = InferOutput<typeof TestCommand>;

    const sampleInput: TestInput = {
      id: '019728a3-7f4a-7000-8000-000000000000',
      name: 'Valid Name',
    };
    const sampleOutput: TestOutput = {
      id: '019728a3-7f4a-7000-8000-000000000000',
      name: 'Valid Name',
    };

    expect(sampleInput.name).toBe('Valid Name');
    expect(sampleOutput.name).toBe('Valid Name');
  });

  it('createCommand attaches requestKind and preserves BaseCommand arguments', () => {
    const commandSchema = z.object({ title: z.string().min(1) });
    class MyBaseCommand {
      constructor(public readonly sessionUser?: { id: string }) {}
    }

    class TestCommand extends createCommand(commandSchema, MyBaseCommand) {}

    expect(TestCommand.requestKind).toBe('command');
    expect(TestCommand.$kind).toBe('command');
    expect(TestCommand[ZOD_SCHEMA_KEY]).toBe(commandSchema);

    const cmd = new TestCommand({ title: 'Task 1' }, { id: 'user_1' });
    expect(cmd.title).toBe('Task 1');
    expect(cmd.sessionUser).toEqual({ id: 'user_1' });
    expect(cmd).toBeInstanceOf(MyBaseCommand);
    expect(cmd).toBeInstanceOf(TestCommand);
  });

  it('createQuery attaches requestKind and preserves BaseQuery arguments', () => {
    const querySchema = z.object({ filter: z.string() });
    class MyBaseQuery {
      constructor(
        public readonly options?: { hydrate?: boolean },
        public readonly sessionUser?: { id: string },
      ) {}
    }

    class TestQuery extends createQuery(querySchema, MyBaseQuery) {}

    expect(TestQuery.requestKind).toBe('query');
    expect(TestQuery.$kind).toBe('query');
    expect(TestQuery[ZOD_SCHEMA_KEY]).toBe(querySchema);

    const qry = new TestQuery(
      { filter: 'active' },
      { hydrate: true },
      { id: 'user_2' },
    );
    expect(qry.filter).toBe('active');
    expect(qry.options).toEqual({ hydrate: true });
    expect(qry.sessionUser).toEqual({ id: 'user_2' });
    expect(qry).toBeInstanceOf(MyBaseQuery);
    expect(qry).toBeInstanceOf(TestQuery);
  });
});
