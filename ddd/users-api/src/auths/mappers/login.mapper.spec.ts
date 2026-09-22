/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CreateAuthCommand } from '../cqrs/commands/create-auth.command';
import { LoginMapper } from './login.mapper';

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

  it('throws BadRequestException for invalid email or missing code', () => {
    expect(() =>
      LoginMapper.map(
        { email: 'not-an-email', code: '123456' } as any,
        '203.0.113.7',
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      LoginMapper.map(
        { email: 'user@example.test', code: '' } as any,
        '203.0.113.7',
      ),
    ).toThrow(BadRequestException);
  });
});
