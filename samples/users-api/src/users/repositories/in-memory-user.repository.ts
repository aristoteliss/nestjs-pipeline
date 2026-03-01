import { Injectable, NotFoundException } from '@nestjs/common';
import { User, UserSnapshot } from '../domain/user.entity';
import { IUserRepository } from './user.repository.interface';

/**
 * In-memory implementation of {@link IUserRepository}.
 *
 * Stores {@link UserSnapshot} plain objects so each `findById` / `findAll`
 * call reconstitutes a fresh `User` instance — preventing callers from
 * accidentally sharing mutable state.
 *
 * Swap this out for a TypeORM / Prisma / MongoDB implementation without
 * changing any handler or domain code.
 */
@Injectable()
export class InMemoryUserRepository implements IUserRepository {
  private readonly store = new Map<string, UserSnapshot>();

  save(user: User): void {
    this.store.set(user.id, user.toSnapshot());
  }

  findById(id: string): User {
    const snapshot = this.store.get(id);
    if (!snapshot) throw new NotFoundException(`User ${id} not found`);
    return User.reconstitute(snapshot);
  }

  findAll(): User[] {
    return Array.from(this.store.values()).map(User.reconstitute);
  }

  delete(id: string): void {
    this.findById(id); // validates existence first
    this.store.delete(id);
  }
}
