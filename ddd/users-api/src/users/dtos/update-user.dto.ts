/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';
import {
  EMPTY_USER_UPDATE_MESSAGE,
  UpdateUserCommand,
} from '../cqrs/commands/update-user.command';

const { username, department } = UpdateUserCommand.schema.shape;

/**
 * Mutable user fields accepted by update requests, with the field rules of
 * {@link UpdateUserCommand}. At least one field must be present;
 * `department: null` clears the department.
 */
export const UpdateUserDtoSchema = z
  .object({ name: username, department })
  .refine(
    (value) => value.name !== undefined || value.department !== undefined,
    { message: EMPTY_USER_UPDATE_MESSAGE },
  );

export type UpdateUserDto = z.infer<typeof UpdateUserDtoSchema>;
