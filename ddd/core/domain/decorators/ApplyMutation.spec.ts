/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { IEvent } from '../events/event.interface';
import { UnknownMutableFieldError } from '../exceptions/unknown-mutable-field.error';
import { ApplyMutation, type MutationPatch } from './ApplyMutation';
import { Mutable } from './Mutable';

class RenamedEvent implements IEvent {
  constructor(
    readonly name: string,
    readonly version: number,
  ) {}
}

class ScoreChangedEvent implements IEvent {
  constructor(
    readonly score: number,
    readonly version: number,
  ) {}
}

class Aggregate {
  @Mutable<string>({ normalize: (value) => value.trim() })
  private _name = '';

  @Mutable<number>()
  private _score = 0;

  version = 1;
  applied: IEvent[] = [];
  onUpdateHook = vi.fn();

  get name(): string {
    return this._name;
  }

  get score(): number {
    return this._score;
  }

  onUpdate(): void {
    this.version += 1;
    this.onUpdateHook();
  }

  apply(event: IEvent): void {
    this.applied.push(event);
  }

  @ApplyMutation<Aggregate>({
    event: (entity) => new RenamedEvent(entity.name, entity.version),
  })
  rename(name: string, score?: number): MutationPatch<Aggregate> {
    if (name.trim().length === 0) {
      throw new Error('empty name');
    }
    return { name, score };
  }

  @ApplyMutation<Aggregate>({
    event: (entity) => new RenamedEvent(entity.name, entity.version),
  })
  async renameAsync(name: string): Promise<MutationPatch<Aggregate>> {
    await Promise.resolve();
    return { name };
  }

  @ApplyMutation<Aggregate>({
    event: (entity) => new RenamedEvent(entity.name, entity.version),
  })
  touch(): MutationPatch<Aggregate> {}

  @ApplyMutation<Aggregate>({
    event: (entity) => [
      new RenamedEvent(entity.name, entity.version),
      new ScoreChangedEvent(entity.score, entity.version),
    ],
  })
  multiEvent(name: string, score: number): MutationPatch<Aggregate> {
    return { name, score };
  }

  @ApplyMutation<Aggregate>({
    event: (entity) => new RenamedEvent(entity.name, entity.version),
  })
  bogus(): MutationPatch<Aggregate> {
    return { applied: [] } as MutationPatch<Aggregate>;
  }
}

describe('@ApplyMutation decorator', () => {
  it('applies the patch, normalizes it and skips undefined fields', () => {
    const entity = new Aggregate();

    entity.rename('  Bob  ');

    expect(entity.name).toBe('Bob');
    expect(entity.score).toBe(0);
  });

  it('records the event after the lifecycle advance', () => {
    const entity = new Aggregate();

    entity.rename('Bob');

    expect(entity.onUpdateHook).toHaveBeenCalledTimes(1);
    expect(entity.applied).toHaveLength(1);
    expect(entity.applied[0]).toEqual(new RenamedEvent('Bob', 2));
  });

  it('supports emitting multiple events from an array factory', () => {
    const entity = new Aggregate();

    entity.multiEvent('Charlie', 42);

    expect(entity.version).toBe(2);
    expect(entity.applied).toHaveLength(2);
    expect(entity.applied[0]).toEqual(new RenamedEvent('Charlie', 2));
    expect(entity.applied[1]).toEqual(new ScoreChangedEvent(42, 2));
  });

  it('records an event for a mutation that changes no field', () => {
    const entity = new Aggregate();

    entity.touch();

    expect(entity.version).toBe(2);
    expect(entity.applied).toHaveLength(1);
  });

  it('leaves the aggregate untouched when the method throws', () => {
    const entity = new Aggregate();

    expect(() => entity.rename('   ')).toThrow('empty name');
    expect(entity.version).toBe(1);
    expect(entity.applied).toHaveLength(0);
  });

  it('completes an async mutation only after the promise resolves', async () => {
    const entity = new Aggregate();

    const pending = entity.renameAsync('Alice');
    expect(entity.version).toBe(1);

    await pending;
    expect(entity.name).toBe('Alice');
    expect(entity.version).toBe(2);
    expect(entity.applied).toEqual([new RenamedEvent('Alice', 2)]);
  });

  it('rejects a patch key that is not declared mutable', () => {
    const entity = new Aggregate();

    expect(() => entity.bogus()).toThrow(UnknownMutableFieldError);
    expect(entity.version).toBe(1);
    expect(entity.applied).toHaveLength(0);
  });

  it('throws TypeError if options or options.event is not provided', () => {
    // @ts-expect-error test runtime validation
    expect(() => ApplyMutation()).toThrow(TypeError);

    // @ts-expect-error test runtime validation
    expect(() => ApplyMutation({})).toThrow(TypeError);
  });
});
