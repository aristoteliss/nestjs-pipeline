/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CreateRoleCommand } from '../cqrs/commands/create-role.command';
import { UpdateRoleCommand } from '../cqrs/commands/update-role.command';
import { CreateRoleMapper } from './create-role.mapper';
import { UpdateRoleMapper } from './update-role.mapper';

describe('Roles Mappers', () => {
  describe('CreateRoleMapper', () => {
    it('maps valid DTO to CreateRoleCommand', () => {
      const dto = { name: 'admin' };
      const cmd = CreateRoleMapper.map(dto);

      expect(cmd).toBeInstanceOf(CreateRoleCommand);
      expect(cmd.name).toBe('admin');
    });

    it('throws BadRequestException for empty or invalid name', () => {
      expect(() => CreateRoleMapper.map({ name: '' } as any)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('UpdateRoleMapper', () => {
    const validId = '019488e0-0000-7000-8000-000000000001';

    it('maps id and name to UpdateRoleCommand', () => {
      const cmd = UpdateRoleMapper.map(validId, { name: 'superadmin' });

      expect(cmd).toBeInstanceOf(UpdateRoleCommand);
      expect(cmd.id).toBe(validId);
      expect(cmd.name).toBe('superadmin');
    });

    it('throws BadRequestException for invalid id format', () => {
      expect(() =>
        UpdateRoleMapper.map('invalid-id', { name: 'superadmin' }),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid role name', () => {
      expect(() => UpdateRoleMapper.map(validId, { name: '' } as any)).toThrow(
        BadRequestException,
      );
    });
  });
});
