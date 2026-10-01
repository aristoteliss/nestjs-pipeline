/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { describe, expect, it } from 'vitest';
import { UpdateRoleCommand } from './update-role.command.js';

describe('UpdateRoleCommand', () => {
  it('marks exactly the field the update handler writes, which CASL checks', () => {
    expect(UpdateRoleCommand.updatableFields).toEqual(['name']);
  });

  it('reports the updatable fields the command carries', () => {
    const command = new UpdateRoleCommand({
      id: '019488e0-0000-7000-8000-000000000001',
      name: 'admin',
    });

    expect(command.getUpdateFields(UpdateRoleCommand.updatableFields)).toEqual([
      'name',
    ]);
  });
});
