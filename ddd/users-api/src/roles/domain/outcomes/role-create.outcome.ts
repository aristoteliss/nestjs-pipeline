import { DomainEvent, RootDomainOutcome } from '@nestjs-pipeline/ddd-core';
import { Role } from '../models/role.entity';

export class RoleCreateOutcome extends RootDomainOutcome<Role> {
  public constructor(entity: Role, events: Array<DomainEvent>) {
    super(entity, events);
  }
}
