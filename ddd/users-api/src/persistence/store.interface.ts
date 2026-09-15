/* Copyright (C) 2026-present Aristotelis — see repository license. */

export interface IStore<T> {
  save(key: string, value: T): Promise<void>;
  get(key: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  delete(key: string): Promise<void>;
}
