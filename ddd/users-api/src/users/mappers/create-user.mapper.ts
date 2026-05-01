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
import { CreateUserCommand } from '../cqrs/commands/create-user.command';
import { CreateUserDtoSchema } from '../dtos/create-user.dto';

export const CreateUserMapper = createMapper(
  CreateUserDtoSchema.transform(
    ({ name, email, tenantId, department }) => new CreateUserCommand({
      username: name,
      email,
      tenantId,
      department
    }),
  ),
);
