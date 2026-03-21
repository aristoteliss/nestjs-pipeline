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
import { User } from '../domain/user.entity';

export const UserResponseDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
}).transform(({ id, email, username }) => ({ id, email, name: username }));

export type UserResponseDto = z.output<typeof UserResponseDtoSchema>;

export function toResponseDto(user: User): UserResponseDto {
  const result = UserResponseDtoSchema.safeParse(user.toJSON());
  if (!result.success) throw new InternalServerErrorException('Response mapping failed');
  return result.data;
}