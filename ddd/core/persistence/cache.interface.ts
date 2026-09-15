/* Copyright (C) 2026-present Aristotelis — see repository license. */

export interface CacheSetOptions {
  ttl?: number;
  isNewer?: (cached: unknown, incoming: unknown) => boolean;
}

export interface ICache<T = unknown> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, options?: CacheSetOptions): Promise<void>;
  delete(key: string): Promise<void>;
}
