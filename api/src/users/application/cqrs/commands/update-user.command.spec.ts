/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { describe, expect, it } from 'vitest';
import { UpdateUserCommand } from './update-user.command.js';

const ID = '019488e0-0000-7000-8000-000000000001';
const fields = UpdateUserCommand.updatableFields;

describe('UpdateUserCommand', () => {
  it('marks exactly the fields the update handler writes, which CASL checks', () => {
    expect(fields).toEqual(['username', 'department']);
  });

  it('reports only the updatable fields the command carries', () => {
    expect(
      new UpdateUserCommand({ id: ID, username: 'Ada' }).getUpdateFields(
        fields,
      ),
    ).toEqual(['username']);
    expect(
      new UpdateUserCommand({
        id: ID,
        username: 'Ada',
        department: 'Research',
      }).getUpdateFields(fields),
    ).toEqual(['username', 'department']);
  });

  it('reports a field cleared to null, because clearing is a mutation', () => {
    expect(
      new UpdateUserCommand({ id: ID, department: null }).getUpdateFields(
        fields,
      ),
    ).toEqual(['department']);
  });

  it('never reports the identifier or a property the schema does not mark', () => {
    const command = new UpdateUserCommand({ id: ID, username: 'Ada' });
    (command as unknown as Record<string, unknown>).salary = 100;

    expect(command.getUpdateFields(fields)).toEqual(['username']);
  });
});
