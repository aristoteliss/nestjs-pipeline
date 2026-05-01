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
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { createMapper } from '@common/mappers/create-mapper.helper';
import { z } from 'zod';
import { UpdateRoleCommand } from '../cqrs/commands/update-role.command';
import {
  type UpdateRoleDto,
  UpdateRoleDtoSchema,
} from '../dtos/update-role.dto';

const base = createMapper(
  z
    .object({ id: z.uuid() })
    .extend(UpdateRoleDtoSchema.shape)
    .transform(({ id, name }) => new UpdateRoleCommand({ id, name })),
);

export const UpdateRoleMapper = {
  ...base,
  map: (id: string, dto: UpdateRoleDto) => base.map({ id, ...dto }),
};
