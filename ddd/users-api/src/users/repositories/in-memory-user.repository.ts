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
import { MemoryStore } from '../db/memory-store';
import { User, type UserSnapshot } from '../domain/models/user.entity';
import type { IUserRepository } from './user.repository.interface';

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
  constructor(private readonly store: MemoryStore<UserSnapshot>) {}

  async save(user: User): Promise<void> {
    await this.store.save(user.id, user.toJSON());
  }

  async findById(id: string): Promise<User> {
    const snapshot = await this.store.get(id);
    if (!snapshot) throw new NotFoundException(`User ${id} not found`);
    return User.fromJSON(snapshot);
  }

  async findAll(): Promise<User[]> {
    const all = await this.store.getAll();
    return all.map((snapshot) => User.fromJSON(snapshot));
  }

  async delete(id: string): Promise<void> {
    await this.store.delete(id);
  }
}
