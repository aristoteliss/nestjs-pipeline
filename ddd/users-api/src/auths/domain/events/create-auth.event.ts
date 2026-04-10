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

import { RootDomainEvent } from '@nestjs-pipeline/ddd-core';
import { Auth } from '../models/auth.entity';

export class CreatedAuthEvent extends RootDomainEvent<Auth> {
  constructor(entity: Auth) {
    super(entity);
  }
}
