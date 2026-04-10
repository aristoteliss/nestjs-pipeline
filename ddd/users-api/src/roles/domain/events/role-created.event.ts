import { RootDomainEvent } from '@nestjs-pipeline/ddd-core';
import { Role } from '../models/role.entity';

export class RoleCreatedEvent extends RootDomainEvent<Role> {
  public constructor(entity: Role) {
    super(entity);
  }
}
