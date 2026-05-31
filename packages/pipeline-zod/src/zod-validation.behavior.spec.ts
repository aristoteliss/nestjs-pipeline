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

import { Type } from '@nestjs/common';
import { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ZodValidationError } from './errors/zod-validation.error';
import {
  ZOD_SCHEMA_KEY,
  ZodValidationBehavior,
} from './zod-validation.behavior';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequestType(schema?: z.ZodType): Type {
  const cls = class { };
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
    handlerType: class MockHandler { } as Type,
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
});
