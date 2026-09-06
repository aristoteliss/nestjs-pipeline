import { DomainException } from '@nestjs-pipeline/ddd-core';
import { Role } from '../role.entity';

export class UniqueRoleNameException extends DomainException {
  readonly role?: Role | string;

  constructor(role?: Role | string, message?: string) {
    const roleName = typeof role === 'string' ? role : role?.name;
    const msg =
      message ??
      (roleName
        ? `Role with name "${roleName}" already exists`
        : 'Role name must be unique');
    super(msg);
    this.name = 'UniqueRoleNameException';
    this.role = role;
  }
}

export class InvalidRoleNameException extends DomainException {
  readonly minLength: number;
  readonly actualValue?: string | null;

  constructor(minLength = 3, actualValue?: string | null, message?: string) {
    const msg =
      message ?? `Role name must be at least ${minLength} characters.`;
    super(msg);
    this.name = 'InvalidRoleNameException';
    this.minLength = minLength;
    this.actualValue = actualValue;
  }
}
