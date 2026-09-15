/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { Mutate } from './Mutate';

class MutableObject {
  value = 0;
  onUpdateHook = vi.fn();

  onUpdate(): void {
    this.onUpdateHook();
  }

  @Mutate()
  incrementSync(amount: number): number {
    this.value += amount;
    return this.value;
  }

  @Mutate()
  async incrementAsync(amount: number): Promise<number> {
    await new Promise((r) => setTimeout(r, 10));
    this.value += amount;
    return this.value;
  }
}

describe('@Mutate decorator', () => {
  it('calls onUpdate hook after synchronous method execution', () => {
    const obj = new MutableObject();
    const result = obj.incrementSync(5);

    expect(result).toBe(5);
    expect(obj.value).toBe(5);
    expect(obj.onUpdateHook).toHaveBeenCalledTimes(1);
  });

  it('calls onUpdate hook after asynchronous method resolution', async () => {
    const obj = new MutableObject();
    const result = await obj.incrementAsync(10);

    expect(result).toBe(10);
    expect(obj.value).toBe(10);
    expect(obj.onUpdateHook).toHaveBeenCalledTimes(1);
  });
});
