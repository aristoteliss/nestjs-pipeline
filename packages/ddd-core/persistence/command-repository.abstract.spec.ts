/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { MemoryCache } from './cache/memory.cache';
import type { ICache } from './cache.interface';
import { CommandRepository } from './command-repository.abstract';

class NoteRepository extends CommandRepository<string, string, string> {
  async save(note: string): Promise<string> {
    await this.cache.set(`note:${note}`, note);
    return note;
  }

  get injectedCache(): ICache<string> {
    return this.cache;
  }
}

describe('CommandRepository', () => {
  it('keeps the cache it was constructed with for subclasses to use', async () => {
    const cache = new MemoryCache<string>();
    const repository = new NoteRepository(cache);

    await expect(repository.save('hello')).resolves.toBe('hello');
    expect(repository.injectedCache).toBe(cache);
    await expect(cache.get('note:hello')).resolves.toBe('hello');
  });
});
