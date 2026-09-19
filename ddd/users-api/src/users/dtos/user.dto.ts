/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import type { User, UserSnapshot } from '../domain/models/user.entity';

/**
 * Public user response shape. `username` is exposed as `name`; omitted fields
 * stay omitted and an explicit empty department is serialized as `null`.
 *
 * @example
 * `{ "id": "019...", "email": "user@example.com", "name": "Jane Doe", "department": "Support" }`
 */
export const UserResponseDtoSchema = z
  .object({
    id: z.string().optional(),
    email: z.string().optional(),
    username: z.string().optional(),
    name: z.string().optional(),
    department: z.string().nullable().optional(),
  })
  .transform(({ id, email, username, name, department }) => ({
    ...(id !== undefined ? { id } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(username !== undefined || name !== undefined
      ? { name: username ?? name }
      : {}),
    ...(department !== undefined ? { department: department ?? null } : {}),
  }));

export type UserResponseDto = z.output<typeof UserResponseDtoSchema>;

export function toResponseDto(
  user: User | UserSnapshot | null,
): UserResponseDto {
  if (!user) throw new NotFoundException('User not found');

  const plain =
    'toJSON' in user && typeof user.toJSON === 'function'
      ? user.toJSON()
      : user;

  const result = UserResponseDtoSchema.safeParse(plain);

  if (!result.success)
    throw new InternalServerErrorException('Response mapping failed');

  return result.data;
}
