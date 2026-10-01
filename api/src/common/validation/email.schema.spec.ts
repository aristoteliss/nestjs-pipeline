/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { describe, expect, it } from 'vitest';
import { CreateAuthCommand } from '../../auths/application/cqrs/commands/create-auth.command.js';
import { LoginDtoSchema } from '../../auths/dtos/login.dto.js';
import { CreateUserCommand } from '../../users/application/cqrs/commands/create-user.command.js';

describe('EmailSchema consumers', () => {
  it('canonicalizes registration and login emails identically', () => {
    const input = '  User@Example.COM ';

    expect(
      new CreateUserCommand({
        username: 'Alice',
        email: input,
      }).email,
    ).toBe('user@example.com');
    expect(LoginDtoSchema.parse({ email: input, code: '1234' }).email).toBe(
      'user@example.com',
    );
    expect(
      new CreateAuthCommand({
        email: input,
        code: '1234',
        clientIp: '203.0.113.7',
      }).email,
    ).toBe('user@example.com');
  });
});
