/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
 */
import { InternalServerErrorException } from '@nestjs/common';
import { z } from 'zod';
import type { User, UserSnapshot } from '../domain/models/user.entity';

export const UserResponseDtoSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    username: z.string(),
    tenantId: z.string().optional(),
    department: z.string().optional(),
  })
  .transform(({ id, email, username, department }) => ({
    id,
    email,
    name: username,
    department,
  }));

export type UserResponseDto = z.output<typeof UserResponseDtoSchema>;

export function toResponseDto(user: User | UserSnapshot): UserResponseDto {
  const plain =
    'toJSON' in user && typeof user.toJSON === 'function'
      ? user.toJSON()
      : user;
  const result = UserResponseDtoSchema.safeParse(plain);
  if (!result.success)
    throw new InternalServerErrorException('Response mapping failed');
  return result.data;
}
