/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RootDomainEvent } from '@nestjs-pipeline/ddd-core/domain';
import { Role } from '../models/role.entity';

export class RoleCreatedEvent extends RootDomainEvent<Role> {
  public constructor(entity: Role) {
    super(entity);
  }
}
