/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
 */
import type { User } from '../domain/user.entity';

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
