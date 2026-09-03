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

import type { ZodTypeAny, z } from 'zod';
import { ZodValidationError } from './errors/zod-validation.error';
import { ZOD_SCHEMA_KEY } from './zod-validation.behavior';

type AbstractConstructor<T = object> = abstract new (...args: never[]) => T;

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
  safeParse(input: unknown): ReturnType<TSchema['safeParse']>;
};

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

    static safeParse(input: unknown) {
      return schema.safeParse(input) as ReturnType<TSchema['safeParse']>;
    }

    constructor(input: z.input<TSchema>, ...baseArgs: unknown[]) {
      super(...baseArgs);

      const result = schema.safeParse(input);
      if (!result.success) {
        throw new ZodValidationError(result.error);
      }

      if (result.data && typeof result.data === 'object') {
        for (const [key, value] of Object.entries(result.data)) {
          if (value !== undefined) {
            Object.defineProperty(this, key, {
              value,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          }
        }
      }
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
  readonly $kind: 'command';
};

export type ZodQueryClass<
  TSchema extends ZodTypeAny,
  TBase extends AbstractConstructor,
> = ZodRequestClass<TSchema, TBase> & {
  readonly requestKind: 'query';
  readonly $kind: 'query';
};

/**
 * Generates a strongly-typed CQRS Command class from a Zod schema.
 *
 * Automatically marks the class with `requestKind = 'command'` and `$kind = 'command'`,
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
  Object.assign(RequestClass, {
    requestKind: 'command',
    $kind: 'command',
  });
  return RequestClass as unknown as ZodCommandClass<TSchema, TBase>;
}

export const createZodCommand = createCommand;

/**
 * Generates a strongly-typed CQRS Query class from a Zod schema.
 *
 * Automatically marks the class with `requestKind = 'query'` and `$kind = 'query'`,
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
  Object.assign(RequestClass, {
    requestKind: 'query',
    $kind: 'query',
  });
  return RequestClass as unknown as ZodQueryClass<TSchema, TBase>;
}

export const createZodQuery = createQuery;
