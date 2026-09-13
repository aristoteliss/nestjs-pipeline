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
import { BaseCommand } from './base.command';

class TestUpdateCommand extends BaseCommand<{ id: string; tenant: string }> {
  readonly id: string;
  readonly name?: string;
  readonly age?: number | null;

  constructor(
    payload: { id: string; name?: string; age?: number | null },
    sessionUser?: { id: string; tenant: string },
  ) {
    super(sessionUser);
    this.id = payload.id;
    this.name = payload.name;
    this.age = payload.age;
  }
}

describe('BaseCommand', () => {
  it('keeps sessionUser non-enumerable', () => {
    const cmd = new TestUpdateCommand(
      { id: '1', name: 'Alice' },
      { id: 'actor-1', tenant: 'tenant' },
    );

    expect(Object.keys(cmd)).not.toContain('sessionUser');
    expect(cmd.sessionUser).toEqual({ id: 'actor-1', tenant: 'tenant' });
  });

  it('extracts defined payload fields excluding id by default', () => {
    const cmd1 = new TestUpdateCommand({ id: '1', name: 'Alice' });
    expect(cmd1.getUpdateFields()).toEqual(['name']);

    const cmd2 = new TestUpdateCommand({ id: '1', name: 'Alice', age: 30 });
    expect(cmd2.getUpdateFields()).toEqual(['name', 'age']);

    const cmd3 = new TestUpdateCommand({ id: '1', age: null });
    expect(cmd3.getUpdateFields()).toEqual(['age']);
  });

  it('allows custom exclude array in getUpdateFields', () => {
    const cmd = new TestUpdateCommand({ id: '1', name: 'Alice', age: 30 });
    expect(cmd.getUpdateFields(['id', 'age'])).toEqual(['name']);
  });
});
