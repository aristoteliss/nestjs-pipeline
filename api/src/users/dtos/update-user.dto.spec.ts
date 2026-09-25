/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_USER_UPDATE_MESSAGE,
  UpdateUserCommand,
} from '../cqrs/commands/update-user.command';
import { UpdateUserDtoSchema } from './update-user.dto';

describe('UpdateUserDtoSchema', () => {
  it('rejects an empty update', () => {
    expect(UpdateUserDtoSchema.safeParse({}).success).toBe(false);
  });

  it('accepts each mutable field independently', () => {
    expect(UpdateUserDtoSchema.safeParse({ name: 'Alice' }).success).toBe(true);
    expect(UpdateUserDtoSchema.safeParse({ department: null }).success).toBe(
      true,
    );
  });

  it('applies the same field rules and empty-update message as the command', () => {
    const id = '019488e0-0000-7000-8000-000000000001';

    expect(UpdateUserDtoSchema.safeParse({ name: 'ab' }).success).toBe(false);
    expect(UpdateUserCommand.safeParse({ id, username: 'ab' }).success).toBe(
      false,
    );
    expect(UpdateUserDtoSchema.safeParse({}).error?.issues[0]?.message).toBe(
      EMPTY_USER_UPDATE_MESSAGE,
    );
    expect(UpdateUserCommand.safeParse({ id }).error?.issues[0]?.message).toBe(
      EMPTY_USER_UPDATE_MESSAGE,
    );
  });
});
