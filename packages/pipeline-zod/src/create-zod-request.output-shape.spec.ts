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

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createZodRequest } from './create-zod-request';

describe('createZodRequest output shape', () => {
  it.each([
    ['primitive', z.object({ value: z.string() }).transform((x) => x.value)],
    ['array', z.object({ value: z.string() }).transform((x) => [x.value])],
    ['Date', z.object({ value: z.string() }).transform(() => new Date(0))],
  ])('rejects a top-level %s transform', (_name, schema) => {
    const Request = createZodRequest(schema as never);
    expect(() => new Request({ value: 'x' } as never)).toThrow(
      /top-level parsed output to be a plain object/,
    );
  });

  it('continues to apply object transforms in-place', () => {
    const Request = createZodRequest(
      z.object({ value: z.string() }).transform(({ value }) => ({
        value: value.trim(),
        normalized: true,
      })),
    );

    const request = new Request({ value: '  x  ' });
    expect(request).toMatchObject({ value: 'x', normalized: true });
  });
});
