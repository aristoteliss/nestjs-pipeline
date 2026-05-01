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

function makeClass(schema?: z.ZodType) {
  const cls = class { };
  if (schema) (cls as any)[ZOD_SCHEMA_KEY] = schema;
  return cls;
}

function ctx(request: unknown, requestType: any, kind: string = 'command') {
  return { request, requestType, requestKind: kind } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ZodValidationBehavior – integration', () => {
  const behavior = new ZodValidationBehavior();
  const next = vi.fn().mockResolvedValue('ok');

  describe('pass-through (no schema)', () => {
    it('calls next() when requestType has no schema', async () => {
      const result = await behavior.handle(ctx({}, makeClass()), next);
      expect(result).toBe('ok');
    });
  });

  describe('valid requests', () => {
    it('passes for a matching object', async () => {
      const Req = makeClass(z.object({ foo: z.string() }));
      const result = await behavior.handle(ctx({ foo: 'bar' }, Req), next);
      expect(result).toBe('ok');
    });

    it('passes for nested objects', async () => {
      const Req = makeClass(z.object({ user: z.object({ name: z.string() }) }));
      const result = await behavior.handle(
        ctx({ user: { name: 'Alice' } }, Req),
        next,
      );
      expect(result).toBe('ok');
    });

    it('passes for optional fields', async () => {
      const Req = makeClass(
        z.object({ name: z.string(), bio: z.string().optional() }),
      );
      const result = await behavior.handle(ctx({ name: 'Alice' }, Req), next);
      expect(result).toBe('ok');
    });
  });

  describe('invalid requests', () => {
    it('throws ZodValidationError for wrong types', async () => {
      const Req = makeClass(z.object({ foo: z.string() }));
      await expect(
        behavior.handle(ctx({ foo: 123 }, Req), next),
      ).rejects.toThrow(ZodValidationError);
    });

    it('throws for missing required fields', async () => {
      const Req = makeClass(
        z.object({ name: z.string(), email: z.string().email() }),
      );
      await expect(behavior.handle(ctx({}, Req), next)).rejects.toThrow(
        'Validation failed',
      );
    });

    it('does NOT call next() on validation failure', async () => {
      const spy = vi.fn();
      const Req = makeClass(z.object({ foo: z.string() }));
      await behavior.handle(ctx({ foo: 123 }, Req), spy).catch(() => { });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('event validation', () => {
    it('validates events with attached schema', async () => {
      const Req = makeClass(z.object({ userId: z.string().uuid() }));
      const result = await behavior.handle(
        ctx({ userId: '018e0d5c-4ef6-7000-b7c8-a1e6bc5c9e70' }, Req, 'event'),
        next,
      );
      expect(result).toBe('ok');
    });

    it('rejects invalid events', async () => {
      const Req = makeClass(z.object({ userId: z.string().uuid() }));
      await expect(
        behavior.handle(ctx({ userId: 'not-uuid' }, Req, 'event'), next),
      ).rejects.toThrow(ZodValidationError);
    });
  });
});
