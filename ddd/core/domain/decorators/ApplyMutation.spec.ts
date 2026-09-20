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

class TestAggregate {
  @Mutable<string>({ normalize: (value) => value.trim() })
  private _name = 'initial';

  @Mutable<number>({
    normalize: (value) => {
      if (value < 0) {
        throw new RangeError('score must be non-negative');
      }
      return value;
    },
  })
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

  @ApplyMutation<TestAggregate>({
    event: (entity) => new RenamedEvent(entity.name, entity.version),
  })
  rename(name: string, score?: number): MutationPatch<TestAggregate> {
    if (name.trim().length === 0) {
      throw new Error('empty name');
    }
    return { name, score };
  }

  @ApplyMutation<TestAggregate>({
    event: (entity) => new RenamedEvent(entity.name, entity.version),
  })
  async renameAsync(name: string): Promise<MutationPatch<TestAggregate>> {
    await Promise.resolve();
    return { name };
  }

  @ApplyMutation<TestAggregate>({
    event: (entity) => new RenamedEvent(entity.name, entity.version),
  })
  touch(): MutationPatch<TestAggregate> {}

  @ApplyMutation<TestAggregate>({
    event: (entity) => [
      new RenamedEvent(entity.name, entity.version),
      new ScoreChangedEvent(entity.score, entity.version),
    ],
  })
  multiEvent(name: string, score: number): MutationPatch<TestAggregate> {
    return { name, score };
  }

  @ApplyMutation<TestAggregate>({
    event: (entity) => new RenamedEvent(entity.name, entity.version),
  })
  bogus(): MutationPatch<TestAggregate> {
    return {
      name: 'NewName',
      applied: [],
    } as unknown as MutationPatch<TestAggregate>;
  }

  @ApplyMutation<TestAggregate>({
    // @ts-expect-error test runtime validation of empty event collection
    event: () => [],
  })
  emptyEvent(): MutationPatch<TestAggregate> {
    return { name: 'EmptyEvent' };
  }

  @ApplyMutation<TestAggregate>({
    // @ts-expect-error test runtime validation of invalid later entry
    event: (entity) => [new RenamedEvent(entity.name, entity.version), null],
  })
  invalidLaterEvent(): MutationPatch<TestAggregate> {
    return { name: 'InvalidLater' };
  }

  @ApplyMutation<TestAggregate>({
    // @ts-expect-error test runtime validation of null event
    event: () => null,
  })
  nullEvent(): MutationPatch<TestAggregate> {
    return { name: 'NullEvent' };
  }

  @ApplyMutation<TestAggregate>({
    event: () => {
      throw new Error('event factory crashed');
    },
  })
  throwingEventFactory(): MutationPatch<TestAggregate> {
    return { name: 'FactoryCrash' };
  }
}

class BaseAggregate {
  @Mutable<string>()
  protected _title = 'base';

  version = 1;
  applied: IEvent[] = [];

  get title(): string {
    return this._title;
  }

  onUpdate(): void {
    this.version += 1;
  }

  apply(event: IEvent): void {
    this.applied.push(event);
  }
}

class SubAggregate extends BaseAggregate {
  @Mutable<string>({ as: 'title', normalize: (val) => val.toUpperCase() })
  protected override _title = 'sub';

  @Mutable<string>()
  private _extra = 'extra';

  get extra(): string {
    return this._extra;
  }

  @ApplyMutation<SubAggregate>({
    event: (entity) => new RenamedEvent(entity.title, entity.version),
  })
  updateAll(title: string, extra: string): MutationPatch<SubAggregate> {
    return { title, extra } as unknown as MutationPatch<SubAggregate>;
  }
}

describe('@ApplyMutation decorator', () => {
  describe('successful mutations', () => {
    it('applies the patch, normalizes values and returns the normalized patch', () => {
      const entity = new TestAggregate();

      const result = entity.rename('  Bob  ', 10);

      expect(entity.name).toBe('Bob');
      expect(entity.score).toBe(10);
      expect(result).toEqual({ name: 'Bob', score: 10 });
    });

    it('records the domain event after the lifecycle advance', () => {
      const entity = new TestAggregate();

      entity.rename('Bob');

      expect(entity.onUpdateHook).toHaveBeenCalledTimes(1);
      expect(entity.applied).toHaveLength(1);
      expect(entity.applied[0]).toEqual(new RenamedEvent('Bob', 2));
    });

    it('supports emitting multiple events and retains event order', () => {
      const entity = new TestAggregate();

      entity.multiEvent('Charlie', 42);

      expect(entity.version).toBe(2);
      expect(entity.applied).toHaveLength(2);
      expect(entity.applied[0]).toEqual(new RenamedEvent('Charlie', 2));
      expect(entity.applied[1]).toEqual(new ScoreChangedEvent(42, 2));
    });

    it('records an event for a mutation that changes no field and returns undefined', () => {
      const entity = new TestAggregate();

      const result = entity.touch();

      expect(entity.version).toBe(2);
      expect(entity.applied).toHaveLength(1);
      expect(result).toBeUndefined();
    });

    it('completes an async mutation only after the promise resolves and returns normalized patch', async () => {
      const entity = new TestAggregate();

      const pending = entity.renameAsync('  Alice  ');
      expect(entity.version).toBe(1);

      const result = await pending;
      expect(entity.name).toBe('Alice');
      expect(entity.version).toBe(2);
      expect(entity.applied).toEqual([new RenamedEvent('Alice', 2)]);
      expect(result).toEqual({ name: 'Alice' });
    });
  });

  describe('pre-application rejection', () => {
    it('leaves aggregate untouched when the method body throws', () => {
      const entity = new TestAggregate();

      expect(() => entity.rename('   ')).toThrow('empty name');
      expect(entity.name).toBe('initial');
      expect(entity.version).toBe(1);
      expect(entity.applied).toHaveLength(0);
    });

    it('makes no writes when a patch contains a valid first field and an unknown second key', () => {
      const entity = new TestAggregate();

      expect(() => entity.bogus()).toThrow(UnknownMutableFieldError);
      expect(entity.name).toBe('initial');
      expect(entity.version).toBe(1);
      expect(entity.applied).toHaveLength(0);
    });

    it('makes no writes when a patch contains a valid first field and an invalid normalized second field', () => {
      const entity = new TestAggregate();

      expect(() => entity.rename('Alice', -5)).toThrow(
        'score must be non-negative',
      );
      expect(entity.name).toBe('initial');
      expect(entity.score).toBe(0);
      expect(entity.version).toBe(1);
      expect(entity.applied).toHaveLength(0);
    });

    it('makes no writes when async method rejects', async () => {
      class AsyncFailAggregate extends TestAggregate {
        @ApplyMutation<AsyncFailAggregate>({
          event: (e) => new RenamedEvent(e.name, e.version),
        })
        async failAsync(): Promise<MutationPatch<AsyncFailAggregate>> {
          await Promise.resolve();
          throw new Error('async rejected');
        }
      }

      const entity = new AsyncFailAggregate();
      await expect(entity.failAsync()).rejects.toThrow('async rejected');

      expect(entity.name).toBe('initial');
      expect(entity.version).toBe(1);
      expect(entity.applied).toHaveLength(0);
    });
  });

  describe('post-application failure', () => {
    it('propagates failure from throwing onUpdate without applying events', () => {
      const entity = new TestAggregate();
      entity.onUpdate = () => {
        throw new Error('lifecycle hook failure');
      };

      expect(() => entity.rename('Bob')).toThrow('lifecycle hook failure');
      expect(entity.name).toBe('Bob');
      expect(entity.applied).toHaveLength(0);
    });

    it('propagates failure from throwing event factory leaving version updated but no event applied', () => {
      const entity = new TestAggregate();

      expect(() => entity.throwingEventFactory()).toThrow(
        'event factory crashed',
      );
      expect(entity.name).toBe('FactoryCrash');
      expect(entity.version).toBe(2);
      expect(entity.applied).toHaveLength(0);
    });

    it('propagates failure from throwing apply handler', () => {
      const entity = new TestAggregate();
      entity.apply = () => {
        throw new Error('event application failure');
      };

      expect(() => entity.rename('Bob')).toThrow('event application failure');
      expect(entity.name).toBe('Bob');
      expect(entity.version).toBe(2);
    });
  });

  describe('mandatory contract checks', () => {
    it('rejects target instance missing callable onUpdate before mutation work', () => {
      class MissingOnUpdate {
        @Mutable<string>()
        name = 'test';

        apply(): void {}

        @ApplyMutation({
          event: () => ({}),
        })
        change(): MutationPatch<MissingOnUpdate> {
          return { name: 'mutated' };
        }
      }

      const instance = new MissingOnUpdate();
      expect(() => instance.change()).toThrow(TypeError);
      expect(() => instance.change()).toThrow('onUpdate()');
      expect(instance.name).toBe('test');
    });

    it('rejects target instance missing callable apply before mutation work', () => {
      class MissingApply {
        @Mutable<string>()
        name = 'test';

        onUpdate(): void {}

        @ApplyMutation({
          event: () => ({}),
        })
        change(): MutationPatch<MissingApply> {
          return { name: 'mutated' };
        }
      }

      const instance = new MissingApply();
      expect(() => instance.change()).toThrow(TypeError);
      expect(() => instance.change()).toThrow('apply()');
      expect(instance.name).toBe('test');
    });

    it('throws TypeError if options or options.event is missing', () => {
      // @ts-expect-error test runtime validation
      expect(() => ApplyMutation()).toThrow(TypeError);

      // @ts-expect-error test runtime validation
      expect(() => ApplyMutation({})).toThrow(TypeError);
    });

    it('rejects empty event collection with TypeError', () => {
      const entity = new TestAggregate();

      expect(() => entity.emptyEvent()).toThrow(TypeError);
      expect(() => entity.emptyEvent()).toThrow('at least one domain event');
      expect(entity.applied).toHaveLength(0);
    });

    it('rejects invalid later event array entry before applying any event', () => {
      const entity = new TestAggregate();

      expect(() => entity.invalidLaterEvent()).toThrow(TypeError);
      expect(() => entity.invalidLaterEvent()).toThrow(
        'invalid event at index 1',
      );
      expect(entity.applied).toHaveLength(0);
    });

    it('rejects null event result with TypeError', () => {
      const entity = new TestAggregate();

      expect(() => entity.nullEvent()).toThrow(TypeError);
      expect(() => entity.nullEvent()).toThrow(
        'domain event object or non-empty array',
      );
      expect(entity.applied).toHaveLength(0);
    });
  });

  describe('inheritance and nearest-declaration precedence', () => {
    it('inherits mutable fields from base class and honors subclass overrides', () => {
      const sub = new SubAggregate();

      sub.updateAll('sub-title', 'extra-value');

      expect(sub.title).toBe('SUB-TITLE');
      expect(sub.extra).toBe('extra-value');
      expect(sub.version).toBe(2);
      expect(sub.applied).toHaveLength(1);
    });
  });
});
