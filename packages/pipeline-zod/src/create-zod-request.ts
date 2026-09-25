/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ZodType, z } from 'zod';
import { ZodValidationError } from './errors/zod-validation.error';
import {
  assertPlainRequestOutput,
  defineEnumerableDataProperties,
} from './helpers/request-output';
import { setRawInput, setValidatedData } from './helpers/zod-data.helpers';
import { updatableFieldsOf } from './updatable';
import { ZOD_SCHEMA_KEY } from './zod-validation.behavior';

/**
 * Constructor shape accepted as the optional base class for generated requests.
 *
 * The instance side defaults to `object` so generated request properties remain
 * strongly typed. Constructor arguments stay unconstrained so a base class can
 * take any constructor parameters.
 */
// biome-ignore lint/suspicious/noExplicitAny: constructor parameter covariance requires any[]
type AbstractConstructor<T = object> = abstract new (...args: any[]) => T;

/**
 * Extracts the input type of a command or query class generated from a Zod schema.
 */
export type InferInput<T> = T extends { readonly [ZOD_SCHEMA_KEY]: infer S }
  ? S extends ZodType
    ? z.input<S>
    : never
  : never;

/**
 * Extracts the output (parsed) type of a command or query class generated from a Zod schema.
 */
export type InferOutput<T> = T extends { readonly [ZOD_SCHEMA_KEY]: infer S }
  ? S extends ZodType
    ? z.output<S>
    : never
  : never;

export type ZodRequestClass<
  TSchema extends ZodType,
  TBase extends AbstractConstructor,
> = {
  new (
    input: z.input<TSchema>,
    ...baseArgs: ConstructorParameters<TBase>
  ): InstanceType<TBase> & z.output<TSchema>;
  readonly [ZOD_SCHEMA_KEY]: TSchema;
  readonly schema: TSchema;
  readonly '~standard': unknown;
  parse(
    input: z.input<TSchema>,
    ...baseArgs: ConstructorParameters<TBase>
  ): InstanceType<TBase> & z.output<TSchema>;
  /**
   * Validates asynchronously, then constructs the request instance.
   *
   * Use this for schemas with async refinements/transforms. The normal
   * constructor and {@link parse} are synchronous and therefore require a
   * synchronously parseable schema.
   *
   * @example
   * ```ts
   * const command = await CreateUserCommand.parseAsync(input);
   * await commandBus.execute(command);
   * ```
   */
  parseAsync(
    input: z.input<TSchema>,
    ...baseArgs: ConstructorParameters<TBase>
  ): Promise<InstanceType<TBase> & z.output<TSchema>>;
  safeParse(input: unknown): ReturnType<TSchema['safeParse']>;
};

/**
 * Marker for an instance being built from data that has already been validated.
 *
 * A symbol key cannot collide with a real schema property, so the constructor
 * can tell a pre-validated hand-off from ordinary input without a sentinel that
 * a caller could forge by accident.
 */
const PRE_VALIDATED: unique symbol = Symbol('createZodRequest.preValidated');

interface PreValidated {
  readonly [PRE_VALIDATED]: Record<string, unknown>;
  readonly rawInput: unknown;
}

function isPreValidated(value: unknown): value is PreValidated {
  return typeof value === 'object' && value !== null && PRE_VALIDATED in value;
}

/**
 * Generates a strongly-typed Command, Query, or Event class from a Zod schema.
 *
 * Compatible with NestJS CQRS, Standard Schema, and {@link ZodValidationBehavior}:
 * - Attaches the schema as static `_zodSchema` (`ZOD_SCHEMA_KEY`) and `schema`.
 * - Forwards Standard Schema specification (`~standard`) for schema interoperability.
 * - Provides static `parse()` and `safeParse()` directly on the class.
 * - Inherits from an optional base class, preserving its prototype,
 *   instanceof checks, and constructor arguments.
 * - Validates input and applies transformations (e.g. email trimming / lowercasing) on construction,
 *   throwing {@link ZodValidationError} on invalid payload.
 * - Safely assigns transformed output properties onto the instance including own keys whose parsed value is `undefined`.
 *
 * @example Defining a Command with a base class
 * ```ts
 * abstract class AppCommand {
 *   constructor(readonly actorId?: string) {}
 * }
 *
 * const CreateUserSchema = z.object({
 *   username: z.string().min(3),
 *   email: z.string().email(),
 * });
 *
 * export class CreateUserCommand extends createCommand(CreateUserSchema, AppCommand) {}
 * const command = new CreateUserCommand(input, actorId);
 * ```
 *
 * @example Defining a Query without a base class
 * ```ts
 * const GetUserSchema = z.object({ id: z.string().uuid() });
 * export class GetUserQuery extends createQuery(GetUserSchema) {}
 * ```
 */
export function createZodRequest<
  TSchema extends ZodType,
  TBase extends AbstractConstructor = AbstractConstructor,
>(schema: TSchema, Base?: TBase): ZodRequestClass<TSchema, TBase> {
  const Parent = (Base ?? class {}) as new (...args: unknown[]) => object;

  class Request extends Parent {
    static readonly [ZOD_SCHEMA_KEY] = schema;
    static readonly schema = schema;

    static parse(input: z.input<TSchema>, ...baseArgs: unknown[]) {
      // biome-ignore lint/complexity/noThisInStatic: dynamic subclass instantiation for polymorphic parse()
      const Target = this as unknown as new (
        ...args: unknown[]
      ) => InstanceType<TBase> & z.output<TSchema>;
      return new Target(input, ...baseArgs);
    }

    static async parseAsync(input: z.input<TSchema>, ...baseArgs: unknown[]) {
      const result = await schema.safeParseAsync(input);
      if (!result.success) {
        throw new ZodValidationError(result.error);
      }
      assertPlainRequestOutput(result.data, 'parseAsync');

      // biome-ignore lint/complexity/noThisInStatic: dynamic subclass instantiation for polymorphic parseAsync()
      const Target = this as unknown as new (
        ...args: unknown[]
      ) => InstanceType<TBase> & z.output<TSchema>;
      return new Target(
        { [PRE_VALIDATED]: result.data, rawInput: input },
        ...baseArgs,
      );
    }

    static safeParse(input: unknown) {
      return schema.safeParse(input) as ReturnType<TSchema['safeParse']>;
    }

    constructor(
      input: z.input<TSchema> | PreValidated,
      ...baseArgs: unknown[]
    ) {
      super(...baseArgs);

      let data: Record<string, unknown>;
      let rawInput: unknown;

      if (isPreValidated(input)) {
        // Handed over by parseAsync(), which has already validated and asserted
        // the output shape. Re-running safeParse here would defeat the point:
        // an async schema cannot be parsed synchronously at all.
        data = input[PRE_VALIDATED];
        rawInput = input.rawInput;
      } else {
        const result = schema.safeParse(input);
        if (!result.success) {
          throw new ZodValidationError(result.error);
        }
        assertPlainRequestOutput(result.data, 'constructor');
        data = result.data as Record<string, unknown>;
        rawInput = input;
      }

      setRawInput(this, rawInput);
      defineEnumerableDataProperties(this, data);
      setValidatedData(this, schema, data);
    }
  }

  const standard = (schema as Record<string, unknown>)['~standard'];
  if (standard !== undefined) {
    Object.defineProperty(Request, '~standard', {
      value: standard,
      writable: false,
      enumerable: true,
      configurable: true,
    });
  }

  return Request as unknown as ZodRequestClass<TSchema, TBase>;
}

export type ZodCommandClass<
  TSchema extends ZodType,
  TBase extends AbstractConstructor,
> = ZodRequestClass<TSchema, TBase> & {
  readonly requestKind: 'command';
  /**
   * The top-level fields marked with {@link updatable}, in shape order and
   * frozen: the list of fields to pass to field-level authorization.
   */
  readonly updatableFields: readonly (keyof z.output<TSchema> & string)[];
};

export type ZodQueryClass<
  TSchema extends ZodType,
  TBase extends AbstractConstructor,
> = ZodRequestClass<TSchema, TBase> & {
  readonly requestKind: 'query';
};

/**
 * Generates a strongly-typed CQRS Command class from a Zod schema.
 *
 * Automatically marks the class with `requestKind = 'command'`,
 * attaches the Zod schema as static `_zodSchema`, forwards Standard Schema metadata (`~standard`),
 * lists the fields marked with {@link updatable} as static `updatableFields`,
 * and preserves any Base class inheritance.
 *
 * @example Defining a Command with a base class
 * ```ts
 * abstract class AppCommand {
 *   constructor(readonly actorId?: string) {}
 * }
 *
 * const CreateUserSchema = z.object({
 *   username: z.string().min(3),
 *   email: z.string().email(),
 * });
 *
 * export class CreateUserCommand extends createCommand(CreateUserSchema, AppCommand) {}
 * ```
 *
 * @example Declaring the fields an update command changes
 * ```ts
 * export class UpdateRoleCommand extends createCommand(
 *   z.object({ id: z.uuid(), name: z.string().trim().apply(updatable).min(3) }),
 * ) {}
 *
 * // The fields to pass to field-level authorization:
 * UpdateRoleCommand.updatableFields; // ['name']
 * ```
 */
export function createCommand<
  TSchema extends ZodType,
  TBase extends AbstractConstructor = AbstractConstructor,
>(schema: TSchema, Base?: TBase): ZodCommandClass<TSchema, TBase> {
  const RequestClass = createZodRequest(schema, Base);
  Object.assign(RequestClass, { requestKind: 'command' });
  Object.defineProperty(RequestClass, 'updatableFields', {
    value: updatableFieldsOf(schema),
    enumerable: true,
  });
  return RequestClass as unknown as ZodCommandClass<TSchema, TBase>;
}

/**
 * Generates a strongly-typed CQRS Query class from a Zod schema.
 *
 * Automatically marks the class with `requestKind = 'query'`,
 * attaches the Zod schema as static `_zodSchema`, forwards Standard Schema metadata (`~standard`),
 * and preserves the prototype and constructor arguments of an optional base class.
 *
 * @example Defining a Query with a base class
 * ```ts
 * abstract class AppQuery {
 *   constructor(readonly actorId?: string) {}
 * }
 *
 * const GetUserSchema = z.object({ id: z.string().uuid() });
 * export class GetUserQuery extends createQuery(GetUserSchema, AppQuery) {}
 * ```
 */
export function createQuery<
  TSchema extends ZodType,
  TBase extends AbstractConstructor = AbstractConstructor,
>(schema: TSchema, Base?: TBase): ZodQueryClass<TSchema, TBase> {
  const RequestClass = createZodRequest(schema, Base);
  Object.assign(RequestClass, { requestKind: 'query' });
  return RequestClass as unknown as ZodQueryClass<TSchema, TBase>;
}
