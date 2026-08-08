import { BadRequestException } from '@nestjs/common/exceptions';
import { User } from '../user.entity';

export class UniqueEmailException extends BadRequestException {
  readonly user: User;
  readonly optionalParams?: unknown;

  constructor(user: User, message?: string) {
    super(message ?? `Email ${user.email} already exists`);
    this.user = user;
    this.optionalParams = user;
  }
}
