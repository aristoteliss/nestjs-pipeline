/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { fingerprintValue } from '@cqrs-ddd/pipeline-idempotency';
import { describe, expect, it } from 'vitest';
import { CreateUserCommand } from './create-user.command.js';

describe('CreateUserCommand', () => {
  it('keeps session context out of its fingerprint', () => {
    const command = new CreateUserCommand(
      { username: 'Ada Lovelace', email: 'ada@example.test' },
      { id: 'actor-1', tenant: 'default', email: undefined },
    );

    expect(Object.keys(command)).not.toContain('sessionPrincipal');
    expect(Object.keys(command)).not.toContain('sessionUser');
    expect(fingerprintValue(command)).toBe(
      fingerprintValue({ username: 'Ada Lovelace', email: 'ada@example.test' }),
    );
  });

  it('fingerprints explicit undefined properties like absent ones', () => {
    const command = new CreateUserCommand({
      username: 'Ada Lovelace',
      email: 'ada@example.test',
      department: undefined,
    });

    expect(fingerprintValue(command)).toBe(
      fingerprintValue({ username: 'Ada Lovelace', email: 'ada@example.test' }),
    );
  });
});
