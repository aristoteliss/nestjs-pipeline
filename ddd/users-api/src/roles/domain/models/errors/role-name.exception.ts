import { BadRequestException } from '@nestjs/common/exceptions';
import { Role } from '../role.entity';

export class UniqueRoleNameException extends BadRequestException {
  readonly role?: Role | string;
  readonly optionalParams?: unknown;

  constructor(role?: Role | string, message?: string) {
    const roleName = typeof role === 'string' ? role : role?.name;
    const msg = message ?? (roleName ? `Role with name "${roleName}" already exists` : 'Role name must be unique');
    super(msg);
    this.role = role;
    this.optionalParams = role;
  }
}
