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
import { UpdateUserCommand } from '../cqrs/commands/update-user.command';
import {
  type UpdateUserDto,
  UpdateUserDtoSchema,
} from '../dtos/update-user.dto';

const base = createMapper(
  z
    .object({ id: z.uuid() })
    .extend(UpdateUserDtoSchema.shape)
    .transform(({ id, name, department }) => {
      return new UpdateUserCommand({
        id,
        username: name,
        department: department,
      });
    }),
);

export const UpdateUserMapper = {
  ...base,
  map: (id: string, dto: UpdateUserDto) => base.map({ id, ...dto }),
};
