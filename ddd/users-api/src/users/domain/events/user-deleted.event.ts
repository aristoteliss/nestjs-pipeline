import { RootDomainEvent } from '@nestjs-pipeline/ddd-core';
import { User } from '../models/user.entity';

export class UserDeletedEvent extends RootDomainEvent<User> {
  public constructor(entity: User) {
    super(entity);
  }
}
