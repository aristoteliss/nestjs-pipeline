import { Injectable } from '@nestjs/common';
import { ICache } from '@nestjs-pipeline/ddd-core';

export const CACHE_TOKEN = Symbol('MemoryCache');

@Injectable()
export class MemoryCache<T> implements ICache<T> {
  private store: Map<string, T> = new Map();

  async set(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async get(key: string): Promise<T | undefined> {
    return this.store.get(key);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
