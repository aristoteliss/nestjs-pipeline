/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { fingerprintValue } from '@nestjs-pipeline/idempotency';
import { describe, expect, it } from 'vitest';
import { UpdateRoleCommand } from '../../../roles/cqrs/commands/update-role.command';
import { CreateUserCommand } from '../../../users/cqrs/commands/create-user.command';
import { UpdateUserCommand } from '../../../users/cqrs/commands/update-user.command';

describe('BaseCommand metadata', () => {
  it('keeps session context out of command fingerprints', () => {
    const command = new CreateUserCommand(
      {
        username: 'Ada Lovelace',
        email: 'ada@example.test',
      },
      {
        id: 'actor-1',
        tenant: 'default',
        email: undefined,
      },
    );

    expect(Object.keys(command)).not.toContain('sessionUser');
    expect(fingerprintValue(command)).toBe(
      fingerprintValue({
        username: 'Ada Lovelace',
        email: 'ada@example.test',
      }),
    );
  });

  it('safely fingerprints commands carrying explicit undefined properties', () => {
    const command = new CreateUserCommand({
      username: 'Ada Lovelace',
      email: 'ada@example.test',
      department: undefined,
    });

    expect(() => fingerprintValue(command)).not.toThrow();
    expect(fingerprintValue(command)).toBe(
      fingerprintValue({
        username: 'Ada Lovelace',
        email: 'ada@example.test',
      }),
    );
  });

  it('reports only the declared mutable fields the command carries', () => {
    const fields = UpdateUserCommand.MUTABLE_FIELDS;

    const cmd1 = new UpdateUserCommand({
      id: '019488e0-0000-7000-8000-000000000001',
      username: 'Ada',
    });
    expect(cmd1.getUpdateFields(fields)).toEqual(['username']);

    const cmd2 = new UpdateUserCommand({
      id: '019488e0-0000-7000-8000-000000000001',
      username: 'Ada',
      department: 'Research',
    });
    expect(cmd2.getUpdateFields(fields)).toEqual(['username', 'department']);

    // null is a value: clearing a field is a mutation and must be authorized.
    const cmd3 = new UpdateUserCommand({
      id: '019488e0-0000-7000-8000-000000000001',
      department: null,
    });
    expect(cmd3.getUpdateFields(fields)).toEqual(['department']);
  });

  it('never reports the identifier, which is not a mutable field', () => {
    const command = new UpdateUserCommand({
      id: '019488e0-0000-7000-8000-000000000001',
      username: 'Ada',
    });

    expect(
      command.getUpdateFields(UpdateUserCommand.MUTABLE_FIELDS),
    ).not.toContain('id');
  });

  it('does not widen the authorization surface when the schema gains a field', () => {
    // The whole point of declaring the set. A property the command carries but
    // MUTABLE_FIELDS does not name is not handed to CASL, so adding one to the
    // schema cannot quietly change what is checked.
    const command = new UpdateUserCommand({
      id: '019488e0-0000-7000-8000-000000000001',
      username: 'Ada',
    });
    (command as unknown as Record<string, unknown>).salary = 100;

    expect(command.getUpdateFields(UpdateUserCommand.MUTABLE_FIELDS)).toEqual([
      'username',
    ]);
  });

  it('declares the surface in schema order for the role command too', () => {
    const command = new UpdateRoleCommand({
      id: '019488e0-0000-7000-8000-000000000001',
      name: 'admin',
    });

    expect(command.getUpdateFields(UpdateRoleCommand.MUTABLE_FIELDS)).toEqual([
      'name',
    ]);
  });
});
