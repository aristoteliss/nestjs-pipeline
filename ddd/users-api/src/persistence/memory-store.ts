import { Injectable } from '@nestjs/common';
import { IStore } from './store.interface';

@Injectable()
export class MemoryStore<T> implements IStore<T> {
  private store: Map<string, T> = new Map();

  async save(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async get(key: string): Promise<T | undefined> {
    return this.store.get(key);
  }

  async getAll(): Promise<T[]> {
    return Array.from(this.store.values()) as T[];
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
