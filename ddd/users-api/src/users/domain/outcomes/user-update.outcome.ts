import { DomainEvent, RootDomainOutcome } from '@nestjs-pipeline/ddd-core';
import { User } from '../models/user.entity';

export class UserUpdateOutcome extends RootDomainOutcome<User> {
  public constructor(entity: User, events?: Array<DomainEvent>) {
    super(entity, events);
  }
}
