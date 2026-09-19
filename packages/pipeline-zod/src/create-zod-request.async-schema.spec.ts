/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * The generated constructor is synchronous by design, and the root README says
 * so. What it also said was that a schema with async refinements should be
 * validated in `ZodValidationBehavior` or `ZodPipe` instead — advice that could
 * not be followed for a generated request class, because both run *after*
 * construction and the constructor itself throws
 * "Encountered Promise during synchronous parse".
 *
 * `parseAsync()` is that missing path: validate asynchronously, then build the
 * instance from the already-validated data.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createCommand } from './create-zod-request';
import { ZodValidationError } from './errors/zod-validation.error';

const AsyncSchema = z.object({
  email: z
    .string()
    .refine(async (value) => value.includes('@'), 'must be an email address'),
  age: z.string().transform(async (value) => Number(value)),
});

class RegisterCommand extends createCommand(AsyncSchema) {}

const SyncSchema = z.object({ name: z.string().min(2) });
class RenameCommand extends createCommand(SyncSchema) {}

describe('parseAsync with an asynchronous schema', () => {
  it('constructs an instance the synchronous constructor cannot build', async () => {
    // Establish the premise rather than assuming it.
    expect(
      () => new RegisterCommand({ email: 'ada@example.test', age: '36' }),
    ).toThrow(/synchronous parse/i);

    const command = await RegisterCommand.parseAsync({
      email: 'ada@example.test',
      age: '36',
    });

    expect(command).toBeInstanceOf(RegisterCommand);
    expect(command.email).toBe('ada@example.test');
    expect(command.age).toBe(36);
  });

  it('rejects invalid input with the same error type as the constructor', async () => {
    await expect(
      RegisterCommand.parseAsync({ email: 'not-an-email', age: '1' }),
    ).rejects.toBeInstanceOf(ZodValidationError);
  });

  it('applies asynchronous transforms to the output', async () => {
    const command = await RegisterCommand.parseAsync({
      email: 'a@b.test',
      age: '7',
    });

    expect(typeof command.age).toBe('number');
  });
});

describe('parseAsync with a synchronous schema', () => {
  it('produces an instance equivalent to the constructor', async () => {
    const constructed = new RenameCommand({ name: 'Ada' });
    const parsed = await RenameCommand.parseAsync({ name: 'Ada' });

    expect(parsed).toBeInstanceOf(RenameCommand);
    expect({ ...parsed }).toEqual({ ...constructed });
  });

  it('preserves base-class construction arguments', async () => {
    abstract class BaseCommand {
      constructor(readonly actor?: string) {}
    }
    class Scoped extends createCommand(SyncSchema, BaseCommand) {}

    const command = await Scoped.parseAsync({ name: 'Ada' }, 'actor-1');

    expect(command).toBeInstanceOf(BaseCommand);
    expect(command.actor).toBe('actor-1');
    expect(command.name).toBe('Ada');
  });

  it('cannot be triggered accidentally by ordinary input', async () => {
    // The hand-off marker is a symbol, so a payload cannot forge it.
    const command = await RenameCommand.parseAsync({
      name: 'Ada',
      rawInput: 'attacker-controlled',
    });

    expect(command.name).toBe('Ada');
  });
});
