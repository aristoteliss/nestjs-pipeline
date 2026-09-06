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

import { IPipelineContext } from '@nestjs-pipeline/core';
import { Type } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createCommand, createZodRequest } from './create-zod-request';
import { ZodValidationError } from './errors/zod-validation.error';
import {
  getRawInput,
  ZOD_SCHEMA_KEY,
  ZodValidationBehavior,
} from './zod-validation.behavior';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequestType(schema?: z.ZodType): Type {
  const cls = class {};
  if (schema) (cls as any)[ZOD_SCHEMA_KEY] = schema;
  return cls as unknown as Type;
}

function createMockContext(
  overrides: Partial<IPipelineContext> = {},
): IPipelineContext {
  return {
    correlationId: 'test-corr-id',
    originalCorrelationId: 'test-corr-id',
    request: {},
    requestType: makeRequestType(),
    requestName: 'MockRequest',
    handlerType: class MockHandler {} as Type,
    handlerName: 'MockHandler',
    requestKind: 'command',
    startedAt: new Date(),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ZodValidationBehavior', () => {
  const behavior = new ZodValidationBehavior();

  describe('when no ZOD_SCHEMA is attached to the request type', () => {
    it('calls next() transparently and returns its result', async () => {
      const ctx = createMockContext();
      const next = vi.fn().mockResolvedValue({ ok: true });

      const result = await behavior.handle(ctx, next);

      expect(next).toHaveBeenCalledOnce();
      expect(result).toEqual({ ok: true });
    });

    it('propagates errors thrown by next()', async () => {
      const ctx = createMockContext();
      const next = vi.fn().mockRejectedValue(new Error('handler error'));

      await expect(behavior.handle(ctx, next)).rejects.toThrow('handler error');
    });
  });

  describe('when ZOD_SCHEMA is attached and the request is valid', () => {
    const schema = z.object({
      username: z.string().min(4),
      email: z.string().email(),
    });
    const requestType = makeRequestType(schema);
    const request = { username: 'Alice', email: 'alice@example.com' };

    it('calls next() and returns its result', async () => {
      const ctx = createMockContext({ request, requestType });
      const next = vi.fn().mockResolvedValue({ id: '1' });

      const result = await behavior.handle(ctx, next);

      expect(next).toHaveBeenCalledOnce();
      expect(result).toEqual({ id: '1' });
    });

    it('applies default and transformed values from result.data back onto context.request', async () => {
      const transformSchema = z.object({
        count: z.string().transform((val) => Number(val)),
        role: z.string().default('user'),
      });
      const reqType = makeRequestType(transformSchema);
      const reqObj = { count: '42' };
      const ctx = createMockContext({ request: reqObj, requestType: reqType });
      const next = vi.fn().mockResolvedValue('ok');

      await behavior.handle(ctx, next);

      expect(reqObj).toEqual({ count: 42, role: 'user' });
    });

    it('supports async refinements and transforms', async () => {
      const asyncSchema = z
        .object({ username: z.string() })
        .refine(async ({ username }) => username !== 'taken')
        .transform(async ({ username }) => ({
          username: username.toUpperCase(),
        }));
      const reqType = makeRequestType(asyncSchema);
      const reqObj = { username: 'alice' };
      const ctx = createMockContext({ request: reqObj, requestType: reqType });

      await behavior.handle(ctx, vi.fn().mockResolvedValue('ok'));

      expect(reqObj).toEqual({ username: 'ALICE' });
    });

    it('applies an own __proto__ key without changing the request prototype', async () => {
      const protoSchema = z
        .object({})
        .transform(() => JSON.parse('{"__proto__":{"admin":true}}'));
      const reqType = makeRequestType(protoSchema);
      const reqObj = JSON.parse('{"__proto__":{"admin":true}}') as Record<
        string,
        unknown
      >;
      const originalPrototype = Object.getPrototypeOf(reqObj);

      await behavior.handle(
        createMockContext({ request: reqObj, requestType: reqType }),
        vi.fn().mockResolvedValue('ok'),
      );

      expect(Object.getPrototypeOf(reqObj)).toBe(originalPrototype);
      expect(Object.hasOwn(reqObj, '__proto__')).toBe(true);
      expect(Reflect.get(reqObj, '__proto__')).toEqual({ admin: true });
    });
  });

  describe('when ZOD_SCHEMA is attached and the request is invalid', () => {
    const schema = z.object({
      username: z.string().min(4),
      email: z.string().email(),
    });
    const requestType = makeRequestType(schema);

    it('throws ZodValidationError and does NOT call next()', async () => {
      const invalidRequest = { username: 'Al', email: 'not-an-email' };
      const ctx = createMockContext({ request: invalidRequest, requestType });
      const next = vi.fn();

      await expect(behavior.handle(ctx, next)).rejects.toThrow(
        ZodValidationError,
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('ZodValidationError.details contains field-level errors', async () => {
      const invalidRequest = { username: 'Al', email: 'not-an-email' };
      const ctx = createMockContext({ request: invalidRequest, requestType });
      const next = vi.fn();

      let caught: ZodValidationError | undefined;
      try {
        await behavior.handle(ctx, next);
      } catch (e) {
        caught = e as ZodValidationError;
      }

      expect(caught).toBeInstanceOf(ZodValidationError);
      expect(caught!.details.fieldErrors).toHaveProperty('username');
      expect(caught!.details.fieldErrors).toHaveProperty('email');
    });

    it('ZodValidationError.message is "Validation failed"', async () => {
      const ctx = createMockContext({ request: {}, requestType });
      const next = vi.fn();

      await expect(behavior.handle(ctx, next)).rejects.toThrow(
        'Validation failed',
      );
    });
  });

  describe('event handler scenarios', () => {
    const eventSchema = z.object({
      userId: z.string().uuid(),
      username: z.string().min(1),
    });
    const eventType = makeRequestType(eventSchema);

    it('validates events that have ZOD_SCHEMA attached', async () => {
      const validEvent = {
        userId: '018e0d5c-4ef6-7000-b7c8-a1e6bc5c9e70',
        username: 'Bob',
      };
      const ctx = createMockContext({
        request: validEvent,
        requestType: eventType,
        requestKind: 'event',
      });
      const next = vi.fn().mockResolvedValue(undefined);

      await expect(behavior.handle(ctx, next)).resolves.toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
    });

    it('rejects invalid events that have ZOD_SCHEMA attached', async () => {
      const invalidEvent = { userId: 'not-a-uuid', username: '' };
      const ctx = createMockContext({
        request: invalidEvent,
        requestType: eventType,
        requestKind: 'event',
      });
      const next = vi.fn();

      await expect(behavior.handle(ctx, next)).rejects.toThrow(
        ZodValidationError,
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('createZodRequest transforms and mutation tracking (Item 12)', () => {
    it('handles string -> number transform without re-parse error in the pipeline', async () => {
      const transformSchema = z.object({
        amount: z.string().transform((val) => Number(val)),
      });
      class AmountCommand extends createCommand(transformSchema) {}

      const cmd = new AmountCommand({ amount: '42' });
      expect(cmd.amount).toBe(42);

      const ctx = createMockContext({
        request: cmd,
        requestType: AmountCommand as unknown as Type,
      });
      const next = vi.fn().mockResolvedValue({ success: true });

      const result = await behavior.handle(ctx, next);
      expect(next).toHaveBeenCalledOnce();
      expect(result).toEqual({ success: true });
      expect(cmd.amount).toBe(42);
    });

    it('does NOT re-run non-idempotent transforms twice', async () => {
      const tagSchema = z.object({
        tag: z.string().transform((val) => val + '!'),
      });
      class TagCommand extends createCommand(tagSchema) {}

      const cmd = new TagCommand({ tag: 'hello' });
      expect(cmd.tag).toBe('hello!');

      const ctx = createMockContext({
        request: cmd,
        requestType: TagCommand as unknown as Type,
      });
      const next = vi.fn().mockResolvedValue('done');

      await behavior.handle(ctx, next);
      expect(cmd.tag).toBe('hello!');
    });

    it('re-validates and fails if instance was mutated into an invalid state', async () => {
      const schema = z.object({
        name: z.string().min(3),
      });
      class UserCommand extends createCommand(schema) {}

      const cmd = new UserCommand({ name: 'Alice' });
      expect(cmd.name).toBe('Alice');

      // Mutate to an invalid value
      (cmd as any).name = 'ab';

      const ctx = createMockContext({
        request: cmd,
        requestType: UserCommand as unknown as Type,
      });
      const next = vi.fn();

      await expect(behavior.handle(ctx, next)).rejects.toThrow(
        ZodValidationError,
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('re-validates successfully if instance was mutated into a valid state', async () => {
      const schema = z.object({
        name: z.string().min(3),
      });
      class UserCommand extends createCommand(schema) {}

      const cmd = new UserCommand({ name: 'Alice' });
      (cmd as any).name = 'Bob';

      const ctx = createMockContext({
        request: cmd,
        requestType: UserCommand as unknown as Type,
      });
      const next = vi.fn().mockResolvedValue('ok');

      await behavior.handle(ctx, next);
      expect(next).toHaveBeenCalledOnce();
      expect(cmd.name).toBe('Bob');
    });

    it('preserves raw input accessible via getRawInput', () => {
      const transformSchema = z.object({
        amount: z.string().transform((val) => Number(val)),
      });
      class AmountCommand extends createCommand(transformSchema) {}

      const cmd = new AmountCommand({ amount: '123' });
      expect(cmd.amount).toBe(123);
      expect(getRawInput(cmd)).toEqual({ amount: '123' });
    });

    it('preserves base class properties when request passes through behavior', async () => {
      class BaseClass {
        readonly meta = 'base-metadata';
      }
      const schema = z.object({
        title: z.string(),
      });
      class CommandWithBase extends createZodRequest(schema, BaseClass) {}

      const cmd = new CommandWithBase({ title: 'Important' });
      expect(cmd.meta).toBe('base-metadata');
      expect(cmd.title).toBe('Important');

      const ctx = createMockContext({
        request: cmd,
        requestType: CommandWithBase as unknown as Type,
      });
      const next = vi.fn().mockResolvedValue('ok');

      await behavior.handle(ctx, next);
      expect(next).toHaveBeenCalledOnce();
      expect(cmd.meta).toBe('base-metadata');
      expect(cmd.title).toBe('Important');
    });

    it('handles string -> Map transform without false-positive mutation on repeated behavior passes', async () => {
      const mapSchema = z.object({
        tags: z.string().transform((val) => new Map([[val, true]])),
      });
      const requestType = makeRequestType(mapSchema);
      const req = { tags: 'admin' };

      const ctx = createMockContext({
        request: req,
        requestType,
      });

      const next1 = vi.fn().mockResolvedValue('first');
      await behavior.handle(ctx, next1);
      expect(next1).toHaveBeenCalledOnce();
      expect(req.tags).toBeInstanceOf(Map);
      expect((req.tags as unknown as Map<string, boolean>).get('admin')).toBe(
        true,
      );

      // Second pass with the same request should recognize validated snapshot and NOT re-parse
      const next2 = vi.fn().mockResolvedValue('second');
      const result2 = await behavior.handle(ctx, next2);
      expect(next2).toHaveBeenCalledOnce();
      expect(result2).toBe('second');
    });
  });
});
