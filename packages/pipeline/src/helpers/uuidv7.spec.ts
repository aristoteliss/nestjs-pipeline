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
import { uuidv7 } from './uuidv7';

describe('uuidv7', () => {
  const UUID_V7_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it('generates a valid RFC 9562 UUIDv7 string', () => {
    const id = uuidv7();
    expect(id).toMatch(UUID_V7_REGEX);
    expect(id.length).toBe(36);
  });

  it('generates unique IDs in rapid succession', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(uuidv7());
    }
    expect(ids.size).toBe(1000);
  });

  it('generates monotonically sortable UUIDs over time', async () => {
    const id1 = uuidv7();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const id2 = uuidv7();

    expect(id1 < id2).toBe(true);
  });
});

