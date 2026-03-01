import { User } from '../domain/user.entity';

/**
 * Injection token for the user repository.
 * Use with `@Inject(USER_REPOSITORY)` in handlers and services.
 */
export const USER_REPOSITORY = Symbol('IUserRepository');

/**
 * Repository contract for the User aggregate.
 *
 * Lives in the domain layer — no NestJS or infrastructure imports allowed here.
 * Implementations (in-memory, TypeORM, Prisma, …) live in the infrastructure layer.
 */
export interface IUserRepository {
  /** Persist a new or updated User. */
  save(user: User): void;

  /** Find a user by id. Throws NotFoundException if not found. */
  findById(id: string): User;

  /** Return all stored users. */
  findAll(): User[];

  /** Remove a user by id. Throws NotFoundException if not found. */
  delete(id: string): void;
}
