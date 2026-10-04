/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { describe, expect, it } from 'vitest';
import { CreateRoleCommand } from '../application/cqrs/commands/create-role.command.js';
import { UpdateRoleCommand } from '../application/cqrs/commands/update-role.command.js';
import { CreateRoleMapper } from './create-role.mapper.js';
import { UpdateRoleMapper } from './update-role.mapper.js';

describe('Roles Mappers', () => {
  describe('CreateRoleMapper', () => {
    it('maps valid DTO to CreateRoleCommand', () => {
      const dto = { name: 'admin' };
      const cmd = CreateRoleMapper.map(dto);

      expect(cmd).toBeInstanceOf(CreateRoleCommand);
      expect(cmd.name).toBe('admin');
    });

    it('throws ZodValidationError for empty or invalid name', () => {
      expect(() => CreateRoleMapper.map({ name: '' } as any)).toThrow(
        ZodValidationError,
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

    it('throws ZodValidationError for invalid id format', () => {
      expect(() =>
        UpdateRoleMapper.map('invalid-id', { name: 'superadmin' }),
      ).toThrow(ZodValidationError);
    });

    it('throws ZodValidationError for invalid role name', () => {
      expect(() => UpdateRoleMapper.map(validId, { name: '' } as any)).toThrow(
        ZodValidationError,
      );
    });
  });
});
