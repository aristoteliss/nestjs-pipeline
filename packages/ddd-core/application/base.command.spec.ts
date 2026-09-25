/* Copyright (C) 2026-present Aristotelis — see repository license. */

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

/** The fields TestUpdateCommand subjects to field-level authorization. */
const UPDATABLE_FIELDS = ['name', 'age'] as const;

describe('BaseCommand', () => {
  it('keeps sessionUser non-enumerable', () => {
    const cmd = new TestUpdateCommand(
      { id: '1', name: 'Alice' },
      { id: 'actor-1', tenant: 'tenant' },
    );

    expect(Object.keys(cmd)).not.toContain('sessionUser');
    expect(cmd.sessionUser).toEqual({ id: 'actor-1', tenant: 'tenant' });
  });

  it('reports the declared fields the command carries', () => {
    const cmd1 = new TestUpdateCommand({ id: '1', name: 'Alice' });
    expect(cmd1.getUpdateFields(UPDATABLE_FIELDS)).toEqual(['name']);

    const cmd2 = new TestUpdateCommand({ id: '1', name: 'Alice', age: 30 });
    expect(cmd2.getUpdateFields(UPDATABLE_FIELDS)).toEqual(['name', 'age']);

    // null is a value: clearing a field is a mutation that must be authorized.
    const cmd3 = new TestUpdateCommand({ id: '1', age: null });
    expect(cmd3.getUpdateFields(UPDATABLE_FIELDS)).toEqual(['age']);
  });

  it('reports the declared fields in declaration order, not property order', () => {
    // The order is the caller's, so a schema reordering cannot change which
    // fields a rule sees first.
    const cmd = new TestUpdateCommand({ id: '1', name: 'Alice', age: 30 });
    expect(cmd.getUpdateFields(['age', 'name'])).toEqual(['age', 'name']);
  });

  it('ignores properties the caller did not declare', () => {
    // This is the point of the parameter. Deriving the set from Object.keys
    // meant a new schema property became an authorized field with no edit.
    const cmd = new TestUpdateCommand({ id: '1', name: 'Alice', age: 30 });
    expect(cmd.getUpdateFields(['name'])).toEqual(['name']);
    expect(cmd.getUpdateFields([])).toEqual([]);
  });

  it('reports a declared field the command does not define as absent', () => {
    const cmd = new TestUpdateCommand({ id: '1' });
    expect(cmd.getUpdateFields(['name', 'nonexistent'])).toEqual([]);
  });

  it('serializes via toJSON omitting undefined fields', () => {
    const cmd = new TestUpdateCommand(
      { id: '1', name: 'Alice', age: undefined },
      { id: 'actor-1', tenant: 'tenant' },
    );
    expect(cmd.toJSON()).toEqual({ id: '1', name: 'Alice' });
  });
});
