import { fingerprintValue } from '@nestjs-pipeline/idempotency';
import { describe, expect, it } from 'vitest';
import { CreateUserCommand } from '../../../users/cqrs/commands/create-user.command';
import { UpdateUserCommand } from '../../../users/cqrs/commands/update-user.command';

describe('BaseCommand metadata', () => {
  it('keeps session context out of command fingerprints', () => {
    const command = new CreateUserCommand(
      {
        username: 'Ada Lovelace',
        email: 'ada@example.test',
        department: undefined,
      },
      {
        id: 'actor-1',
        tenant: 'default',
        email: undefined,
      },
    );

    expect(Object.keys(command)).not.toContain('sessionUser');
    expect(() => fingerprintValue(command)).not.toThrow();
    expect(fingerprintValue(command)).toBe(
      fingerprintValue({
        username: 'Ada Lovelace',
        email: 'ada@example.test',
      }),
    );
  });

  it('extracts defined payload fields excluding id and metadata', () => {
    const cmd1 = new UpdateUserCommand({
      id: '019488e0-0000-7000-8000-000000000001',
      username: 'Ada',
    });
    expect(cmd1.getUpdateFields()).toEqual(['username']);

    const cmd2 = new UpdateUserCommand({
      id: '019488e0-0000-7000-8000-000000000001',
      username: 'Ada',
      department: 'Research',
    });
    expect(cmd2.getUpdateFields()).toEqual(['username', 'department']);

    const cmd3 = new UpdateUserCommand({
      id: '019488e0-0000-7000-8000-000000000001',
      department: null,
    });
    expect(cmd3.getUpdateFields()).toEqual(['department']);
  });
});
