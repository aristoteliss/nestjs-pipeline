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

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  ZOD_SCHEMA_KEY,
  ZodValidationBehavior,
} from './zod-validation.behavior';

describe('ZodValidationBehavior top-level transform output', () => {
  it('rejects an array output before mutating the request class instance', async () => {
    const schema = z
      .object({ value: z.string() })
      .transform(({ value }) => value.split(','));

    class Request {
      static readonly [ZOD_SCHEMA_KEY] = schema;
      constructor(public value: string) {}
    }

    const request = new Request('a,b');
    const context = {
      request,
      requestType: Request,
    } as unknown as IPipelineContext;
    const next = vi.fn();

    await expect(
      new ZodValidationBehavior().handle(context, next),
    ).rejects.toThrow(/plain object/);

    expect(request).toEqual({ value: 'a,b' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a primitive output before mutating the request class instance', async () => {
    const schema = z
      .object({ value: z.string() })
      .transform(({ value }) => value.length);

    class Request {
      static readonly [ZOD_SCHEMA_KEY] = schema;
      constructor(public value: string) {}
    }

    const request = new Request('abc');
    const context = {
      request,
      requestType: Request,
    } as unknown as IPipelineContext;

    await expect(
      new ZodValidationBehavior().handle(context, vi.fn()),
    ).rejects.toThrow(/plain object/);
    expect(request).toEqual({ value: 'abc' });
  });
});
