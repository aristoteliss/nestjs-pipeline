/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ZodTypeAny, z } from 'zod';
import { ZodValidationError } from './errors/zod-validation.error';
import { assertPlainRequestOutput } from './helpers/request-output';
import {
  cloneData,
  setRawInput,
  setValidatedData,
} from './helpers/zod-data.helpers';
import { ZOD_SCHEMA_KEY } from './zod-validation.behavior';

/**
 * Constructor shape a generated request may extend.
 *
 * The instance type defaults to `object`, not `any`. With `any`, the generated
 * class's instance was `any & z.output<TSchema>` — which collapses to `any` —
 * so every property check on the result disappeared whenever no base class was
 * supplied. `new Request({ name: 'x' }).nonexistentMethod()` compiled cleanly
 * under strict TypeScript.
 *
 * The parameter list stays `any[]` on purpose: constructor parameter positions
 * are checked bivariantly, and narrowing them here would reject legitimate base
 * classes such as `BaseCommand`.
 */
// biome-ignore lint/suspicious/noExplicitAny: constructor parameter covariance requires any[]
type AbstractConstructor<T = object> = abstract new (...args: any[]) => T;

/**
 * Extracts the input type of a command or query class generated from a Zod schema.
 */
export type InferInput<T> = T extends { readonly [ZOD_SCHEMA_KEY]: infer S }
  ? S extends ZodTypeAny
    ? z.input<S>
    : never
  : never;

/**
 * Extracts the output (parsed) type of a command or query class generated from a Zod schema.
 */
export type InferOutput<T> = T extends { readonly [ZOD_SCHEMA_KEY]: infer S }
  ? S extends ZodTypeAny
    ? z.output<S>
    : never
  : never;

export type ZodRequestClass<
  TSchema extends ZodTypeAny,
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
   * Validates asynchronously, then constructs the instance.
   *
   * The constructor is synchronous by design, which makes it unusable with a
   * schema containing an async refinement or transform: Zod throws
   * "Encountered Promise during synchronous parse". The documented advice was to
   * validate in `ZodValidationBehavior` or `ZodPipe` instead — but those run
   * after construction, so for a generated request class there was no way to
   * construct one at all. This is that missing path.
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
 * Compatible with NestJS CQRS, Standard Schema, and `@nestjs-pipeline/zod`:
 * - Attaches the schema as static `_zodSchema` (`ZOD_SCHEMA_KEY`) and `schema`.
 * - Forwards Standard Schema specification (`~standard`) for native NestJS 12 `StandardSchemaValidationPipe` support.
 * - Provides static `parse()` and `safeParse()` directly on the class.
 * - Inherits from an optional base class (e.g. `BaseCommand`, `BaseQuery`) preserving prototype,
 *   instanceof checks, and constructor arguments.
 * - Validates input and applies transformations (e.g. email trimming / lowercasing) on construction,
 *   throwing {@link ZodValidationError} on invalid payload.
 * - Safely assigns transformed output properties onto the instance without leaking `undefined` keys.
 *
 * @example Defining a Command with BaseCommand
 * ```ts
 * const CreateUserSchema = z.object({
 *   username: z.string().min(3),
 *   email: z.string().email(),
 * });
 *
 * export class CreateUserCommand extends createCommand(CreateUserSchema, BaseCommand) {}
 * ```
 *
 * @example Defining a Query with BaseQuery
 * ```ts
 * const GetUserSchema = z.object({ id: z.string().uuid() });
 * export class GetUserQuery extends createQuery(GetUserSchema, BaseQuery) {}
 * ```
 */
export function createZodRequest<
  TSchema extends ZodTypeAny,
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

      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          Object.defineProperty(this, key, {
            value,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }
      }

      const snapshot: Record<string, unknown> = {};
      for (const key of Object.keys(this)) {
        snapshot[key] = cloneData((this as Record<string, unknown>)[key]);
      }

      setValidatedData(this, snapshot);
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
  TSchema extends ZodTypeAny,
  TBase extends AbstractConstructor,
> = ZodRequestClass<TSchema, TBase> & {
  readonly requestKind: 'command';
};

export type ZodQueryClass<
  TSchema extends ZodTypeAny,
  TBase extends AbstractConstructor,
> = ZodRequestClass<TSchema, TBase> & {
  readonly requestKind: 'query';
};

/**
 * Generates a strongly-typed CQRS Command class from a Zod schema.
 *
 * Automatically marks the class with `requestKind = 'command'`,
 * attaches the Zod schema as static `_zodSchema`, forwards Standard Schema metadata (`~standard`),
 * and preserves any Base class inheritance.
 *
 * @example Defining a Command with BaseCommand
 * ```ts
 * const CreateUserSchema = z.object({
 *   username: z.string().min(3),
 *   email: z.string().email(),
 * });
 *
 * export class CreateUserCommand extends createCommand(CreateUserSchema, BaseCommand) {}
 * ```
 */
export function createCommand<
  TSchema extends ZodTypeAny,
  TBase extends AbstractConstructor = AbstractConstructor,
>(schema: TSchema, Base?: TBase): ZodCommandClass<TSchema, TBase> {
  const RequestClass = createZodRequest(schema, Base);
  Object.assign(RequestClass, { requestKind: 'command' });
  return RequestClass as unknown as ZodCommandClass<TSchema, TBase>;
}

/**
 * Generates a strongly-typed CQRS Query class from a Zod schema.
 *
 * Automatically marks the class with `requestKind = 'query'`,
 * attaches the Zod schema as static `_zodSchema`, forwards Standard Schema metadata (`~standard`),
 * and preserves any Base class inheritance (such as `BaseQuery`).
 *
 * @example Defining a Query with BaseQuery
 * ```ts
 * const GetUserSchema = z.object({ id: z.string().uuid() });
 * export class GetUserQuery extends createQuery(GetUserSchema, BaseQuery) {}
 * ```
 */
export function createQuery<
  TSchema extends ZodTypeAny,
  TBase extends AbstractConstructor = AbstractConstructor,
>(schema: TSchema, Base?: TBase): ZodQueryClass<TSchema, TBase> {
  const RequestClass = createZodRequest(schema, Base);
  Object.assign(RequestClass, { requestKind: 'query' });
  return RequestClass as unknown as ZodQueryClass<TSchema, TBase>;
}
