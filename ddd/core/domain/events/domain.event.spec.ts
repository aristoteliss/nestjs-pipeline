/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { RootEntity } from '../models/root.entity';
import { DomainEvent } from './domain.event';
import { RootDomainEvent } from './root-domain.event';

class CustomDomainEvent extends DomainEvent {
  constructor(
    public readonly detail: string,
    id?: string,
  ) {
    super(id);
  }
}

class UserCreatedEvent extends RootDomainEvent<{ id: string; name: string }> {
  constructor(entity: { id: string; name: string }) {
    super(entity);
  }
}

describe('DomainEvent & RootDomainEvent', () => {
  it('generates a UUIDv7 event id when none is provided', () => {
    const event = new CustomDomainEvent('something happened');
    expect(event.id).toBeDefined();
    expect(event.detail).toBe('something happened');
  });

  it('preserves custom event id when provided', () => {
    const customId = '018f0000-0000-7000-8000-000000000000';
    const event = new CustomDomainEvent('custom', customId);
    expect(event.id).toBe(customId);
  });

  it('RootDomainEvent carries attached entity and captures immutable payload', () => {
    const entity = { id: 'user-1', name: 'Alice' };
    const event = new UserCreatedEvent(entity);

    expect(event.entity).toBe(entity);
    expect(event.id).toBeDefined();
    expect(event.payload).toEqual({ id: 'user-1', name: 'Alice' });
    expect(Object.isFrozen(event.payload)).toBe(true);

    // Mutating entity does not mutate event.payload
    entity.name = 'Bob';
    expect((event.payload as { name: string }).name).toBe('Alice');
  });

  it('RootDomainEvent captures toJSON snapshot when available and preserves against mutation', () => {
    const entity = {
      _name: 'Alice',
      toJSON() {
        return Object.freeze({ name: this._name });
      },
    };
    class CustomEntityEvent extends RootDomainEvent<
      typeof entity,
      { name: string }
    > {
      constructor(e: typeof entity) {
        super(e);
      }
    }

    const event = new CustomEntityEvent(entity);
    expect(event.payload).toEqual({ name: 'Alice' });

    entity._name = 'Bob';
    expect(event.payload.name).toBe('Alice');
  });

  it('RootDomainEvent accepts and freezes explicit custom payload', () => {
    const entity = { id: '123' };
    class ExplicitPayloadEvent extends RootDomainEvent<
      typeof entity,
      { changed: string }
    > {
      constructor(e: typeof entity, payload: { changed: string }) {
        super(e, payload);
      }
    }

    const event = new ExplicitPayloadEvent(entity, { changed: 'status' });
    expect(event.payload).toEqual({ changed: 'status' });
    expect(Object.isFrozen(event.payload)).toBe(true);
  });

  it('RootDomainEvent deeply clones and freezes nested objects, protecting against nested mutations', () => {
    const nestedData = {
      profile: {
        address: {
          city: 'Athens',
        },
        tags: ['developer', 'admin'],
      },
    };
    const entity = { id: 'user-2', data: nestedData };

    class DeepPayloadEvent extends RootDomainEvent<
      typeof entity,
      typeof nestedData
    > {
      constructor(e: typeof entity, payload: typeof nestedData) {
        super(e, payload);
      }
    }

    const event = new DeepPayloadEvent(entity, nestedData);

    // Initial assertions
    expect(event.payload.profile.address.city).toBe('Athens');
    expect(event.payload.profile.tags).toEqual(['developer', 'admin']);

    // Mutating nested source data must NOT affect the captured event payload
    nestedData.profile.address.city = 'Thessaloniki';
    nestedData.profile.tags.push('superadmin');

    expect(event.payload.profile.address.city).toBe('Athens');
    expect(event.payload.profile.tags).toEqual(['developer', 'admin']);

    // Deep freeze guarantees all levels are frozen
    expect(Object.isFrozen(event.payload)).toBe(true);
    expect(Object.isFrozen(event.payload.profile)).toBe(true);
    expect(Object.isFrozen(event.payload.profile.address)).toBe(true);
    expect(Object.isFrozen(event.payload.profile.tags)).toBe(true);

    expect(() => {
      (event.payload.profile.address as any).city = 'Patras';
    }).toThrow();
    expect(() => {
      (event.payload.profile.tags as any).push('guest');
    }).toThrow();
  });

  it('RootDomainEvent deeply clones and protects Date instances against mutation', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const entity = {
      id: 'date-entity',
      createdAt,
      toJSON() {
        return {
          id: this.id,
          createdAt: this.createdAt,
        };
      },
    };

    class DateEntityEvent extends RootDomainEvent<typeof entity> {
      constructor(e: typeof entity) {
        super(e);
      }
    }

    const event = new DateEntityEvent(entity);
    expect(event.payload.createdAt.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );

    // Mutating original date does not affect event.payload
    createdAt.setFullYear(2099);
    expect(event.payload.createdAt.getFullYear()).toBe(2026);

    // Calling mutating methods on payload date throws
    expect(() => {
      event.payload.createdAt.setFullYear(2030);
    }).toThrow(/Cannot mutate frozen Date/);
  });

  it('RootDomainEvent deeply clones and protects Map and Set instances against mutation', () => {
    const sourceMap = new Map<string, any>([
      ['k1', 'v1'],
      ['nested', { count: 1 }],
    ]);
    const sourceSet = new Set<any>(['item1', { name: 'nestedSet' }]);

    const entity = {
      id: 'collection-entity',
      map: sourceMap,
      set: sourceSet,
    };

    class CollectionsEvent extends RootDomainEvent<typeof entity> {
      constructor(e: typeof entity) {
        super(e);
      }
    }

    const event = new CollectionsEvent(entity);

    // Initial assertions
    expect(event.payload.map.get('k1')).toBe('v1');
    expect(event.payload.map.get('nested')).toEqual({ count: 1 });
    expect(event.payload.set.has('item1')).toBe(true);

    // Mutations on source do not affect payload
    sourceMap.set('k1', 'mutated');
    sourceMap.set('k2', 'new');
    sourceSet.add('item2');

    expect(event.payload.map.get('k1')).toBe('v1');
    expect(event.payload.map.has('k2')).toBe(false);
    expect(event.payload.set.has('item2')).toBe(false);

    // Calling mutating methods on payload Map throws
    expect(() => {
      event.payload.map.set('k3', 'val');
    }).toThrow(/Cannot mutate frozen Map/);
    expect(() => {
      event.payload.map.delete('k1');
    }).toThrow(/Cannot mutate frozen Map/);
    expect(() => {
      event.payload.map.clear();
    }).toThrow(/Cannot mutate frozen Map/);

    // Calling mutating methods on payload Set throws
    expect(() => {
      event.payload.set.add('new-item');
    }).toThrow(/Cannot mutate frozen Set/);
    expect(() => {
      event.payload.set.delete('item1');
    }).toThrow(/Cannot mutate frozen Set/);
    expect(() => {
      event.payload.set.clear();
    }).toThrow(/Cannot mutate frozen Set/);
  });

  it('RootDomainEvent handles circular references safely without infinite recursion', () => {
    const circularObj: any = { name: 'cycle' };
    circularObj.self = circularObj;

    class CircularEvent extends RootDomainEvent<any, any> {
      constructor(e: any, payload: any) {
        super(e, payload);
      }
    }

    const event = new CircularEvent({}, circularObj);
    expect(event.payload.name).toBe('cycle');
    expect(event.payload.self).toBe(event.payload);
    expect(Object.isFrozen(event.payload)).toBe(true);
  });
});

/**
 * An event states something that already happened, so what a consumer reads
 * from it must not change afterwards. `payload` is deep-frozen for that reason;
 * `entity` is the live aggregate and is deprecated in favour of the frozen
 * payload and the immutable identity scalars.
 */
describe('RootDomainEvent aggregate reference', () => {
  class Thing extends RootEntity<{ id: string; label: string }> {
    private _label: string;

    constructor(
      snapshot: { id?: string; label: string } & Record<string, unknown>,
    ) {
      super(snapshot as never);
      this._label = snapshot.label;
    }

    get label() {
      return this._label;
    }

    /** Concrete aggregates declare this accessor for the ORM; mirror them. */
    get version(): number {
      return this._version;
    }

    rename(label: string) {
      this._label = label;
    }

    afterUpdate(): void {}

    toJSON() {
      return this.freezeState({
        id: this.id,
        label: this._label,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        version: this.version,
      }) as never;
    }
  }

  class ThingRenamed extends RootDomainEvent<Thing> {
    constructor(thing: Thing) {
      super(thing);
    }
  }

  it('keeps the payload at the state that raised the event', () => {
    const thing = new Thing({ label: 'before' });
    const event = new ThingRenamed(thing);

    thing.rename('after');

    expect((event.payload as { label: string }).label).toBe('before');
  });

  it('exposes immutable identity scalars so consumers need not touch the aggregate', () => {
    const thing = new Thing({ label: 'x' });
    const event = new ThingRenamed(thing);

    expect(event.aggregateId).toBe(thing.id);
    expect(event.aggregateVersion).toBe(thing.version);
  });

  it('leaves the aggregate live and mutable, as the command handler still needs it', () => {
    // Freezing it would break the instance the handler is still working with,
    // which is why the reference is deprecated rather than frozen.
    const thing = new Thing({ label: 'before' });
    const event = new ThingRenamed(thing);

    expect(Object.isFrozen(event.entity)).toBe(false);
    expect(() => thing.rename('after')).not.toThrow();
    expect(event.entity).toBe(thing);
  });
});
