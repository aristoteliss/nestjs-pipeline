/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { IEvent } from '../events/event.interface';
import { UnknownMutableFieldError } from '../exceptions/unknown-mutable-field.error';
import { RootEntity } from '../models/root.entity';
import { ApplyMutation } from './ApplyMutation';
import { getMutableFields, Mutable } from './Mutable';

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

class TestAggregate extends RootEntity {
  toJSON() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
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
  rename(name: string, score?: number): this {
    if (name.trim().length === 0) {
      throw new Error('empty name');
    }
    this.applyPatch({ name, score });
    return this;
  }

  @ApplyMutation<TestAggregate>({
    event: (entity) => new RenamedEvent(entity.name, entity.version),
  })
  async renameAsync(name: string): Promise<this> {
    await Promise.resolve();
    this.applyPatch({ name });
    return this;
  }

  @ApplyMutation<TestAggregate>({
    event: (entity) => new RenamedEvent(entity.name, entity.version),
  })
  touch(): this {
    return this;
  }

  @ApplyMutation<TestAggregate>({
    event: (entity) => [
      new RenamedEvent(entity.name, entity.version),
      new ScoreChangedEvent(entity.score, entity.version),
    ],
  })
  multiEvent(name: string, score: number): this {
    this.applyPatch({ name, score });
    return this;
  }

  @ApplyMutation<TestAggregate>({
    event: (entity) => new RenamedEvent(entity.name, entity.version),
  })
  bogus(): this {
    this.applyPatch({ name: 'NewName', applied: [] });
    return this;
  }

  @ApplyMutation<TestAggregate>({
    // @ts-expect-error test runtime validation of empty event collection
    event: () => [],
  })
  emptyEvent(): this {
    this.applyPatch({ name: 'EmptyEvent' });
    return this;
  }

  @ApplyMutation<TestAggregate>({
    // @ts-expect-error test runtime validation of invalid later entry
    event: (entity) => [new RenamedEvent(entity.name, entity.version), null],
  })
  invalidLaterEvent(): this {
    this.applyPatch({ name: 'InvalidLater' });
    return this;
  }

  @ApplyMutation<TestAggregate>({
    // @ts-expect-error test runtime validation of null event
    event: () => null,
  })
  nullEvent(): this {
    this.applyPatch({ name: 'NullEvent' });
    return this;
  }

  @ApplyMutation<TestAggregate>({
    event: () => {
      throw new Error('event factory crashed');
    },
  })
  throwingEventFactory(): this {
    this.applyPatch({ name: 'FactoryCrash' });
    return this;
  }
}

class BaseAggregate extends RootEntity {
  toJSON() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
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
  updateAll(title: string, extra: string): this {
    this.applyPatch({ title, extra });
    return this;
  }
}

describe('@ApplyMutation decorator', () => {
  describe('successful mutations', () => {
    it('applies the patch, normalizes values and returns the same entity', () => {
      const entity = new TestAggregate();

      const result = entity.rename('  Bob  ', 10);

      expect(entity.name).toBe('Bob');
      expect(entity.score).toBe(10);
      expect(result).toBe(entity);
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

    it('records an event for a mutation that changes no field and returns the same entity', () => {
      const entity = new TestAggregate();

      const result = entity.touch();

      expect(entity.version).toBe(2);
      expect(entity.applied).toHaveLength(1);
      expect(result).toBe(entity);
    });

    it('completes an async mutation only after the promise resolves and returns the same entity', async () => {
      const entity = new TestAggregate();

      const pending = entity.renameAsync('  Alice  ');
      expect(entity.version).toBe(1);

      const result = await pending;
      expect(entity.name).toBe('Alice');
      expect(entity.version).toBe(2);
      expect(entity.applied).toEqual([new RenamedEvent('Alice', 2)]);
      expect(result).toBe(entity);
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
        async failAsync(): Promise<this> {
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
    it('does not complete the lifecycle when method code throws after applying a patch', () => {
      class FailingAggregate extends TestAggregate {
        @ApplyMutation<FailingAggregate>({
          event: (entity) => new RenamedEvent(entity.name, entity.version),
        })
        fail(): this {
          this.applyPatch({ name: 'changed' });
          throw new Error('failed after patch');
        }
      }

      const entity = new FailingAggregate();
      expect(() => entity.fail()).toThrow('failed after patch');
      expect(entity.name).toBe('changed');
      expect(entity.version).toBe(1);
      expect(entity.onUpdateHook).not.toHaveBeenCalled();
      expect(entity.applied).toHaveLength(0);
    });

    it('does not complete the lifecycle when an async method rejects after applying a patch', async () => {
      class FailingAggregate extends TestAggregate {
        @ApplyMutation<FailingAggregate>({
          event: (entity) => new RenamedEvent(entity.name, entity.version),
        })
        async fail(): Promise<this> {
          this.applyPatch({ name: 'changed' });
          await Promise.resolve();
          throw new Error('failed after patch');
        }
      }

      const entity = new FailingAggregate();
      await expect(entity.fail()).rejects.toThrow('failed after patch');
      expect(entity.name).toBe('changed');
      expect(entity.version).toBe(1);
      expect(entity.onUpdateHook).not.toHaveBeenCalled();
      expect(entity.applied).toHaveLength(0);
    });

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
        change(): this {
          throw new Error('method must not run');
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
        change(): this {
          throw new Error('method must not run');
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

  describe('@Mutable decorator validation', () => {
    it('rejects symbol property keys with TypeError', () => {
      const decorator = Mutable();
      expect(() => decorator({}, Symbol('test'))).toThrow(
        new TypeError('@Mutable() supports string properties only.'),
      );
    });

    it('rejects targets without a constructor with TypeError', () => {
      const decorator = Mutable();
      expect(() => decorator(Object.create(null), 'test')).toThrow(
        new TypeError('@Mutable() supports instance properties only.'),
      );
    });

    it('rejects a static property without registering fields on Function', () => {
      class StaticTarget {}
      const decorator = Mutable();
      const before = Object.getOwnPropertySymbols(Function);

      expect(() => decorator(StaticTarget, '_flag')).toThrow(
        new TypeError('@Mutable() supports instance properties only.'),
      );
      expect(Object.getOwnPropertySymbols(Function)).toEqual(before);
    });

    it('skips empty fields entry in getMutableFields when carrier value is undefined', () => {
      class CarrierTest {
        @Mutable()
        declared = 'val';
      }
      const symbol = Object.getOwnPropertySymbols(CarrierTest).find(
        (s) => s.description === 'MUTABLE_FIELDS',
      );
      expect(symbol).toBeDefined();
      (CarrierTest as unknown as Record<symbol, unknown>)[symbol!] = undefined;
      const fields = getMutableFields(new CarrierTest());
      expect(fields.size).toBe(0);
    });
  });
});
