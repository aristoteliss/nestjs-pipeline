/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Declaration-level coverage for the generated request's output type.
 *
 * A request generated without a base class must have the type
 * `z.output<TSchema>`. If its instance type collapsed to `any`, every property
 * check would disappear while the runtime values stayed correct, so no runtime
 * test would notice. These assertions are therefore type-level:
 * `@ts-expect-error` fails the build when the error it expects stops occurring.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createCommand, createQuery } from './create-zod-request';

/** True only when `T` is exactly `any`. */
type IsAny<T> = 0 extends 1 & T ? true : false;

function expectType<T extends true>(_assertion: T): void {
  // Compile-time only.
}

const CreateUserSchema = z.object({
  username: z.string().min(3),
  age: z.number(),
});

const GeneratedCommand = createCommand(CreateUserSchema);
class CreateUserCommand extends GeneratedCommand {}

describe('generated request output types without a base class', () => {
  it('is not `any`', () => {
    // Asserted against the generated class rather than a subclass of it. A
    // `class X extends (expr) {}` declaration gives `X` its own instance type
    // even when the base resolves to `any`, so checking `typeof instanceOfX`
    // would pass either way and prove nothing.
    type GeneratedInstance = InstanceType<typeof GeneratedCommand>;
    expectType<IsAny<GeneratedInstance> extends true ? false : true>(true);

    const request = new CreateUserCommand({ username: 'ada', age: 36 });
    expect(request.username).toBe('ada');
  });

  it('exposes the schema output properties with their real types', () => {
    const request = new CreateUserCommand({ username: 'ada', age: 36 });
    const username: string = request.username;
    const age: number = request.age;

    expect(username).toBe('ada');
    expect(age).toBe(36);
  });

  it('rejects a property that the schema does not define', () => {
    const request = new CreateUserCommand({ username: 'ada', age: 36 });
    // @ts-expect-error nonexistentMethod is not part of the schema output
    expect(() => request.nonexistentMethod()).toThrow();
  });

  it('rejects assigning a string output to a number', () => {
    const request = new CreateUserCommand({ username: 'ada', age: 36 });
    // @ts-expect-error username is a string, not a number
    const wrong: number = request.username;
    expect(typeof wrong).toBe('string');
  });

  it('rejects an input that does not match the schema', () => {
    expect(
      // @ts-expect-error age must be a number
      () => new CreateUserCommand({ username: 'ada', age: 'thirty-six' }),
    ).toThrow();
  });
});

describe('generated request output types with a base class', () => {
  abstract class BaseCommand {
    readonly issuedAt = new Date();
    constructor(readonly actor?: string) {}
  }

  const GetUserSchema = z.object({ id: z.string() });
  class GetUserQuery extends createQuery(GetUserSchema, BaseCommand) {}

  it('preserves both the base fields and the schema output', () => {
    const query = new GetUserQuery({ id: 'u-1' }, 'actor-1');
    const id: string = query.id;
    const actor: string | undefined = query.actor;

    expect(id).toBe('u-1');
    expect(actor).toBe('actor-1');
    expect(query.issuedAt).toBeInstanceOf(Date);
    expect(query).toBeInstanceOf(BaseCommand);
  });

  it('still rejects unknown properties', () => {
    const query = new GetUserQuery({ id: 'u-1' });
    // @ts-expect-error missing is on neither the base nor the schema
    expect(query.missing).toBeUndefined();
  });
});

describe('transformed output types', () => {
  const TrimmedSchema = z.object({
    email: z.string().transform((value) => value.trim().toLowerCase()),
    count: z.string().transform((value) => Number(value)),
  });

  class TrimmedCommand extends createCommand(TrimmedSchema) {}

  it('uses the transformed output type, not the input type', () => {
    const request = new TrimmedCommand({ email: '  A@B.TEST ', count: '3' });
    const count: number = request.count;

    expect(request.email).toBe('a@b.test');
    expect(count).toBe(3);
  });
});
