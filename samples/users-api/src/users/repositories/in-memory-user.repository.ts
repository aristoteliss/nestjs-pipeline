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
    this.store.set(user.id, user.toJSON());
  }

  findById(id: string): User {
    const snapshot = this.store.get(id);
    if (!snapshot) throw new NotFoundException(`User ${id} not found`);
    return User.fromJSON(snapshot);
  }

  findAll(): User[] {
    return Array.from(this.store.values()).map(User.fromJSON);
  }

  delete(id: string): void {
    this.findById(id); // validates existence first
    this.store.delete(id);
  }
}
