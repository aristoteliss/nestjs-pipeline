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
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import type { User } from '../domain/models/user.entity';

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
  save(user: User): Promise<void>;

  /** Find a user by id. Throws NotFoundException if not found. */
  findById(id: string): Promise<User>;

  /** Return all stored users. */
  findAll(): Promise<User[]>;

  /** Remove a user by id. Throws NotFoundException if not found. */
  delete(id: string): Promise<void>;
}
