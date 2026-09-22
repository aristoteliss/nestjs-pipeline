/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';
import { uuidv7 } from '../utils/uuidv7';
import { RootEntity } from './root.entity';

interface TestSnapshot extends Partial<RootEntitySnapshot> {
  name: string;
}

class TestEntity extends RootEntity<TestSnapshot> {
  name: string;
  afterUpdateHook = vi.fn();

  get version(): number {
    return this._version;
  }

  constructor(snapshot?: Partial<TestSnapshot>) {
    super(snapshot);
    this.name = snapshot?.name ?? 'default';
  }

  triggerUpdate(): void {
    this.onUpdate();
  }

  afterUpdate(): void {
    this.afterUpdateHook();
  }

  toJSON(): RootEntitySnapshot & TestSnapshot {
    return this.freezeState({
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      name: this.name,
    });
  }

  static fromJSON(snapshot: TestSnapshot): TestEntity {
    return new TestEntity(snapshot);
  }
}

class OtherEntity extends RootEntity<TestSnapshot> {
  name: string;

  constructor(snapshot?: Partial<TestSnapshot>) {
    super(snapshot);
    this.name = snapshot?.name ?? 'other';
  }

  get version(): number {
    return this._version;
  }

  triggerUpdate(): void {
    this.onUpdate();
  }

  toJSON(): RootEntitySnapshot & TestSnapshot {
    return this.freezeState({
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      name: this.name,
    });
  }

  static fromJSON(snapshot: TestSnapshot): OtherEntity {
    return new OtherEntity(snapshot);
  }
}

describe('RootEntity', () => {
  it('initializes new entity with generated UUIDv7 and current timestamps', () => {
    const entity = new TestEntity({ name: 'Alpha' });

    expect(entity.id).toBeDefined();
    expect(entity.createdAt).toBeInstanceOf(Date);
    expect(entity.updatedAt).toBeInstanceOf(Date);
  });

  it('rehydrates an entity when id, createdAt, and updatedAt are provided together', () => {
    const id = uuidv7();
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');

    const entity = new TestEntity({
      id,
      createdAt,
      updatedAt,
      name: 'Rehydrated',
    });

    expect(entity.id).toBe(id);
    expect(entity.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(entity.updatedAt.toISOString()).toBe(updatedAt.toISOString());
    expect(entity.name).toBe('Rehydrated');
  });

  it('normalizes whitespace around a valid rehydrated id', () => {
    const id = uuidv7();
    const entity = new TestEntity({
      id: `  ${id}\n`,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      name: 'Rehydrated',
    });

    expect(entity.id).toBe(id);
  });

  it('throws when only partial rehydration fields are provided', () => {
    const id = uuidv7();
    expect(() => new TestEntity({ id })).toThrowError(
      'id, createdAt, and updatedAt must be provided together when rehydrating an entity.',
    );
  });

  it('throws on invalid UUIDv7 id during rehydration', () => {
    expect(
      () =>
        new TestEntity({
          id: 'invalid-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    ).toThrowError('id must be a valid UUID v7.');
  });

  it('throws when date string is empty or whitespace', () => {
    const id = uuidv7();
    expect(
      () =>
        new TestEntity({
          id,
          // A blank string is what a malformed persistence row supplies; the
          // cast is the point of the test, not an oversight.
          createdAt: '   ' as unknown as Date,
          updatedAt: new Date(),
        }),
    ).toThrow('Date is empty.');
  });

  it('throws on invalid date during rehydration', () => {
    const id = uuidv7();
    expect(
      () =>
        new TestEntity({
          id,
          createdAt: 'invalid-date' as any,
          updatedAt: new Date(),
        }),
    ).toThrowError('Date must be a valid non-empty date.');
  });

  it('updates updatedAt, increments version, and calls afterUpdate hook on mutation', () => {
    const entity = new TestEntity({ name: 'Initial' });
    const initialUpdatedAt = entity.updatedAt;

    expect(entity.version).toBe(1);
    expect(entity.getExpectedVersion()).toBe(1);

    entity.triggerUpdate();

    expect(entity.afterUpdateHook).toHaveBeenCalledTimes(1);
    expect(entity.updatedAt.getTime()).toBeGreaterThanOrEqual(
      initialUpdatedAt.getTime(),
    );
    expect(entity.version).toBe(2);
    expect(entity.getExpectedVersion()).toBe(1);

    entity.triggerUpdate();
    expect(entity.version).toBe(3);
    expect(entity.getExpectedVersion()).toBe(1);
  });

  it('runs the mutation lifecycle without an afterUpdate override', () => {
    const entity = new OtherEntity({ name: 'plain' });

    entity.triggerUpdate();

    expect(entity.version).toBe(2);
  });

  it('advances expectedVersion baseline when acknowledgePersisted is called without emitting events or bumping version', () => {
    const entity = new TestEntity({ name: 'Alpha' });
    entity.triggerUpdate();
    expect(entity.version).toBe(2);
    expect(entity.getExpectedVersion()).toBe(1);

    entity.acknowledgePersisted(2);
    expect(entity.version).toBe(2);
    expect(entity.getExpectedVersion()).toBe(2);
    expect(entity.getUncommittedEvents()).toEqual([]);

    // Successive mutation now compares against the acknowledged version 2
    entity.triggerUpdate();
    expect(entity.version).toBe(3);
    expect(entity.getExpectedVersion()).toBe(2);

    // Default version argument uses current _version
    entity.acknowledgePersisted();
    expect(entity.getExpectedVersion()).toBe(3);
  });

  it('throws error when acknowledgePersisted is called with non-positive integer', () => {
    const entity = new TestEntity({ name: 'Alpha' });
    expect(() => entity.acknowledgePersisted(0)).toThrow(
      'Persisted version must be a positive integer.',
    );
    expect(() => entity.acknowledgePersisted(-1)).toThrow(
      'Persisted version must be a positive integer.',
    );
    expect(() => entity.acknowledgePersisted(1.5)).toThrow(
      'Persisted version must be a positive integer.',
    );
  });

  it('preserves rehydrated version in expectedVersion across mutations', () => {
    const id = uuidv7();
    const entity = new TestEntity({
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 5,
      name: 'Rehydrated',
    });

    expect(entity.version).toBe(5);
    expect(entity.getExpectedVersion()).toBe(5);

    entity.triggerUpdate();
    expect(entity.version).toBe(6);
    expect(entity.getExpectedVersion()).toBe(5);
  });

  it('serializes state with toJSON', () => {
    const entity = new TestEntity({ name: 'Serialized' });
    const json = entity.toJSON();

    expect(json.id).toBe(entity.id);
    expect(json.name).toBe('Serialized');
    expect(Object.isFrozen(json)).toBe(true);
  });

  describe('from()', () => {
    it('returns candidate as-is when already an entity instance', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const result = TestEntity.from(entity);
      expect(result).toBe(entity);
    });

    it('rehydrates snapshot into entity when plain object is given', () => {
      const snapshot: TestSnapshot = {
        id: uuidv7(),
        createdAt: new Date(),
        updatedAt: new Date(),
        name: 'FromSnapshot',
      };
      const result = TestEntity.from(snapshot);
      expect(result).toBeInstanceOf(TestEntity);
      expect(result?.name).toBe('FromSnapshot');
    });

    it('returns null when candidate is null or undefined', () => {
      expect(TestEntity.from(null)).toBeNull();
      expect(TestEntity.from(undefined)).toBeNull();
    });

    it('throws TypeError when given an incompatible RootEntity instance', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      expect(() => OtherEntity.from(entity as any)).toThrow(TypeError);
      expect(() => OtherEntity.from(entity as any)).toThrow(
        'Cannot rehydrate entity: expected instance of OtherEntity, received incompatible aggregate TestEntity.',
      );
    });
  });

  describe('AggregateRoot event lifecycle', () => {
    it('buffers uncommitted events recorded with apply() and flushes with uncommit()', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      expect(entity.getUncommittedEvents()).toEqual([]);

      const mockEvent = { id: uuidv7(), type: 'TestEvent' };
      entity.apply(mockEvent);

      expect(entity.getUncommittedEvents()).toHaveLength(1);
      expect(entity.getUncommittedEvents()[0]).toBe(mockEvent);

      entity.uncommit();
      expect(entity.getUncommittedEvents()).toEqual([]);
    });
  });

  describe('property setters and persistence acknowledgment', () => {
    it('sets and normalizes id, createdAt, and updatedAt', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const newId = uuidv7();
      entity.id = newId;
      expect(entity.id).toBe(newId);

      const d = new Date('2026-01-01T00:00:00.000Z');
      entity.createdAt = d;
      expect(entity.createdAt).toEqual(d);
      entity.createdAt = '2026-02-01T00:00:00.000Z';
      expect(entity.createdAt).toEqual(new Date('2026-02-01T00:00:00.000Z'));

      entity.updatedAt = d;
      expect(entity.updatedAt).toEqual(d);
      entity.updatedAt = '2026-03-01T00:00:00.000Z';
      expect(entity.updatedAt).toEqual(new Date('2026-03-01T00:00:00.000Z'));
    });

    it('advances current version when acknowledged version exceeds current version', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      expect(entity.version).toBe(1);
      expect(entity.getExpectedVersion()).toBe(1);

      entity.acknowledgePersisted(5);
      expect(entity.getExpectedVersion()).toBe(5);
      expect(entity.version).toBe(5);
    });

    it('rejects null or undefined date with Error in setter', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      expect(() => {
        entity.createdAt = null as unknown as Date;
      }).toThrow('Date is empty.');
      expect(() => {
        entity.createdAt = undefined as unknown as Date;
      }).toThrow('Date is empty.');
    });
  });

  describe('RootEntity.from edge cases', () => {
    it('uses fallback class names when classes are anonymous or constructors lack names', () => {
      const AnonClass = class extends RootEntity {
        constructor(...args: any[]) {
          super(...(args as [any]));
        }
        toJSON() {
          return this.freezeState({
            id: this.id,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
          });
        }
      };
      Object.defineProperty(AnonClass, 'name', { value: '' });

      const other = new OtherEntity();
      Object.defineProperty(other, 'constructor', { value: { name: '' } });

      expect(() => AnonClass.from(other as any)).toThrow(
        'Cannot rehydrate entity: expected instance of TargetEntity, received incompatible aggregate RootEntity.',
      );
    });

    it('returns candidate directly when this context is non-function and candidate is RootEntity', () => {
      const entity = new TestEntity();
      const nonFunctionContext = {
        fromJSON: vi.fn(),
      };
      const result = RootEntity.from.call(nonFunctionContext, entity);
      expect(result).toBe(entity);
    });

    it('throws when this context lacks fromJSON factory', () => {
      expect(() =>
        RootEntity.from.call({} as any, { id: uuidv7() } as any),
      ).toThrow('Cannot rehydrate entity: missing fromJSON factory.');
    });
  });

  describe('applyPatch validation', () => {
    class PatchableEntity extends RootEntity {
      invokeApplyPatch(patch: any) {
        this.applyPatch(patch);
      }
      toJSON() {
        return this.freezeState({
          id: this.id,
          createdAt: this.createdAt,
          updatedAt: this.updatedAt,
        });
      }
    }

    it('returns early when patch is null or undefined', () => {
      const entity = new PatchableEntity();
      expect(() => entity.invokeApplyPatch(undefined)).not.toThrow();
      expect(() => entity.invokeApplyPatch(null)).not.toThrow();
    });

    it('throws TypeError when patch is not an object', () => {
      const entity = new PatchableEntity();
      expect(() => entity.invokeApplyPatch('invalid-patch')).toThrow(TypeError);
      expect(() => entity.invokeApplyPatch(123)).toThrow(
        'applyPatch() requires a field patch object, or nothing.',
      );
    });
  });
});
