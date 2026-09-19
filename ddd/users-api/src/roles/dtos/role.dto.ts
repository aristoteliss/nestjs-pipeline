/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import type { Role, RoleSnapshot } from '../domain/models/role.entity';

/**
 * Public role response shape. Undefined fields are omitted from serialized output.
 *
 * @example
 * `{ "id": "019...", "name": "manager" }`
 */
export const RoleResponseDtoSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
  })
  .transform(({ id, name }) => ({
    ...(id !== undefined ? { id } : {}),
    ...(name !== undefined ? { name } : {}),
  }));

export type RoleResponseDto = z.output<typeof RoleResponseDtoSchema>;

export function toRoleResponseDto(
  role: Role | RoleSnapshot | null,
): RoleResponseDto {
  if (!role) {
    throw new NotFoundException('Role not found');
  }

  const plain =
    'toJSON' in role && typeof role.toJSON === 'function'
      ? role.toJSON()
      : role;
  const result = RoleResponseDtoSchema.safeParse(plain);
  if (!result.success)
    throw new InternalServerErrorException('Response mapping failed');
  return result.data;
}
