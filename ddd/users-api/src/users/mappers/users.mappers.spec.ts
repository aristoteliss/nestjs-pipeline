/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CreateUserCommand } from '../cqrs/commands/create-user.command';
import { UpdateUserCommand } from '../cqrs/commands/update-user.command';
import { CreateUserMapper } from './create-user.mapper';
import { UpdateUserMapper } from './update-user.mapper';

describe('Users Mappers', () => {
  describe('CreateUserMapper', () => {
    it('maps valid DTO with department to CreateUserCommand', () => {
      const dto = {
        name: 'Alice',
        email: 'alice@example.test',
        department: 'Engineering',
      };
      const cmd = CreateUserMapper.map(dto);

      expect(cmd).toBeInstanceOf(CreateUserCommand);
      expect(cmd.username).toBe('Alice');
      expect(cmd.email).toBe('alice@example.test');
      expect(cmd.department).toBe('Engineering');
    });

    it('maps valid DTO without department to CreateUserCommand', () => {
      const dto = {
        name: 'Bob',
        email: 'bob@example.test',
      };
      const cmd = CreateUserMapper.map(dto);

      expect(cmd).toBeInstanceOf(CreateUserCommand);
      expect(cmd.username).toBe('Bob');
      expect(cmd.email).toBe('bob@example.test');
      expect(cmd.department).toBeUndefined();
    });

    it('throws BadRequestException for invalid email or name', () => {
      expect(() =>
        CreateUserMapper.map({ name: '', email: 'not-an-email' } as any),
      ).toThrow(BadRequestException);
    });
  });

  describe('UpdateUserMapper', () => {
    const validId = '019488e0-0000-7000-8000-000000000001';

    it('maps id and name to UpdateUserCommand', () => {
      const cmd = UpdateUserMapper.map(validId, { name: 'Alicia' });

      expect(cmd).toBeInstanceOf(UpdateUserCommand);
      expect(cmd.id).toBe(validId);
      expect(cmd.username).toBe('Alicia');
      expect(cmd.department).toBeUndefined();
    });

    it('maps id and department to UpdateUserCommand', () => {
      const cmd = UpdateUserMapper.map(validId, { department: 'Finance' });

      expect(cmd).toBeInstanceOf(UpdateUserCommand);
      expect(cmd.id).toBe(validId);
      expect(cmd.username).toBeUndefined();
      expect(cmd.department).toBe('Finance');
    });

    it('maps id, name, and department to UpdateUserCommand', () => {
      const cmd = UpdateUserMapper.map(validId, {
        name: 'Alicia',
        department: 'Finance',
      });

      expect(cmd).toBeInstanceOf(UpdateUserCommand);
      expect(cmd.id).toBe(validId);
      expect(cmd.username).toBe('Alicia');
      expect(cmd.department).toBe('Finance');
    });

    it('throws BadRequestException when no mutable fields are provided', () => {
      expect(() => UpdateUserMapper.map(validId, {})).toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for non-uuid id', () => {
      expect(() =>
        UpdateUserMapper.map('invalid-uuid', { name: 'Alicia' }),
      ).toThrow(BadRequestException);
    });
  });
});
