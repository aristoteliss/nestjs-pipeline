/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { describe, expect, it } from 'vitest';
import { CreateAuthCommand } from '../application/cqrs/commands/create-auth.command.js';
import { LoginMapper } from './login.mapper.js';

describe('LoginMapper', () => {
  it('maps valid LoginDto to CreateAuthCommand', () => {
    const dto = {
      email: 'user@example.test',
      code: '123456',
    };
    const cmd = LoginMapper.map(dto, '203.0.113.7');

    expect(cmd).toBeInstanceOf(CreateAuthCommand);
    expect(cmd.email).toBe('user@example.test');
    expect(cmd.code).toBe('123456');
    expect(cmd.clientIp).toBe('203.0.113.7');
  });

  it('throws ZodValidationError for invalid email or missing code', () => {
    expect(() =>
      LoginMapper.map(
        { email: 'not-an-email', code: '123456' } as any,
        '203.0.113.7',
      ),
    ).toThrow(ZodValidationError);

    expect(() =>
      LoginMapper.map(
        { email: 'user@example.test', code: '' } as any,
        '203.0.113.7',
      ),
    ).toThrow(ZodValidationError);
  });
});
