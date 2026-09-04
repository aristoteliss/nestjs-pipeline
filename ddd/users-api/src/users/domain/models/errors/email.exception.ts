import { BadRequestException } from '@nestjs/common/exceptions';
import { User } from '../user.entity';

/**
 * Domain exception thrown when attempting to persist a user with an email address
 * that already belongs to another user in the same tenant.
 *
 * Extends NestJS {@link BadRequestException} to return a standard HTTP 400 response.
 *
 * @example
 * ```ts
 * if (existingUser) {
 *   throw new UniqueEmailException(user);
 * }
 * ```
 */
export class UniqueEmailException extends BadRequestException {
  readonly user: User;
  readonly optionalParams?: unknown;

  /**
   * Creates a new {@link UniqueEmailException}.
   *
   * @param user - The User entity whose email address conflicted.
   * @param message - Optional custom error message override.
   */
  constructor(user: User, message?: string) {
    const msg = message ?? `Email ${user.email} already exists`;
    super(msg);
    this.name = 'UniqueEmailException';
    this.user = user;
    this.optionalParams = user;
  }
}
