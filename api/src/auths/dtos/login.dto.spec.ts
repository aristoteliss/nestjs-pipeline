/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { CreateAuthCommand } from '../application/cqrs/commands/create-auth.command.js';
import { LoginDtoSchema } from './login.dto.js';

describe('LoginDtoSchema', () => {
  it('accepts exactly the login codes the login command accepts', () => {
    const email = 'user@example.test';
    const clientIp = '203.0.113.7';

    for (const code of ['', '123', '1234', '123456', '1234567']) {
      expect(LoginDtoSchema.safeParse({ email, code }).success).toBe(
        CreateAuthCommand.safeParse({ email, code, clientIp }).success,
      );
    }
    expect(LoginDtoSchema.safeParse({ email, code: '123' }).success).toBe(
      false,
    );
  });
});
