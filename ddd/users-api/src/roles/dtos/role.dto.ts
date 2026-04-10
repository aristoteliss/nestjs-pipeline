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
import type { Role, RoleSnapshot } from '../domain/models/role.entity';

export const RoleResponseDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type RoleResponseDto = z.output<typeof RoleResponseDtoSchema>;

export function toRoleResponseDto(role: Role | RoleSnapshot): RoleResponseDto {
  const plain =
    'toJSON' in role && typeof role.toJSON === 'function'
      ? role.toJSON()
      : role;
  const result = RoleResponseDtoSchema.safeParse(plain);
  if (!result.success)
    throw new InternalServerErrorException('Response mapping failed');
  return result.data;
}
