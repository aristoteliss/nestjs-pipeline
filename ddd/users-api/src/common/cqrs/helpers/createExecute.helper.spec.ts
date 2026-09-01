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

import { ZodValidationError } from '@nestjs-pipeline/zod';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createExecuteClass } from './createExecute.helper';

describe('createExecuteClass', () => {
  const testSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(3),
    age: z.number().optional(),
  });

  class BaseTestClass {
    readonly metadata = 'base-meta';
  }

  it('generates a class with static _zodSchema attached', () => {
    class TestCommand extends createExecuteClass(testSchema) {}
    expect(TestCommand._zodSchema).toBe(testSchema);
  });

  it('instantiates valid payload and assigns fields to instance', () => {
    class TestCommand extends createExecuteClass(testSchema) {}
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
    class TestCommand extends createExecuteClass(testSchema) {}
    const cmd = new TestCommand({
      id: '019728a3-7f4a-7000-8000-000000000000',
      name: 'John Doe',
    });

    expect(cmd.age).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(cmd, 'age')).toBeUndefined();
  });

  it('throws ZodValidationError when input validation fails', () => {
    class TestCommand extends createExecuteClass(testSchema) {}

    expect(
      () =>
        new TestCommand({
          id: 'invalid-uuid',
          name: 'ab', // too short
        }),
    ).toThrow(ZodValidationError);
  });

  it('inherits from optional base class and preserves base properties', () => {
    class TestCommandWithBase extends createExecuteClass(
      testSchema,
      BaseTestClass,
    ) {}
    const cmd = new TestCommandWithBase({
      id: '019728a3-7f4a-7000-8000-000000000000',
      name: 'Alice',
    });

    expect(cmd.metadata).toBe('base-meta');
    expect(cmd).toBeInstanceOf(BaseTestClass);
    expect(cmd).toBeInstanceOf(TestCommandWithBase);
  });

  it('safely defines own properties even if base class has a prototype getter', () => {
    class BaseWithGetter {
      get name(): string {
        return 'from-getter';
      }
    }

    class TestCommandWithGetterBase extends createExecuteClass(
      testSchema,
      BaseWithGetter,
    ) {}

    const cmd = new TestCommandWithGetterBase({
      id: '019728a3-7f4a-7000-8000-000000000000',
      name: 'Shadowed',
    });

    expect(cmd.name).toBe('Shadowed');
    expect(Object.getOwnPropertyDescriptor(cmd, 'name')).toBeDefined();
  });
});
