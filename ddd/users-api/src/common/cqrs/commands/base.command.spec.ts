import { fingerprintValue } from '@nestjs-pipeline/idempotency';
import { describe, expect, it } from 'vitest';
import { CreateUserCommand } from '../../../users/cqrs/commands/create-user.command';

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
});
