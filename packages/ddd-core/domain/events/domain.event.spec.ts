/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { isUuidV7 } from '@cqrs-ddd/uuidv7';
import { describe, expect, it } from 'vitest';
import { RootEntity } from '../models/root.entity';
import { DomainEvent } from './domain.event';
import { deepCloneAndFreeze, RootDomainEvent } from './root-domain.event';

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

interface BuiltIns {
  at: Date;
  map: Map<string, string>;
  set: Set<string>;
}

function builtIns(): BuiltIns {
  return {
    at: new Date('2026-01-01T00:00:00Z'),
    map: new Map([['k', 'v']]),
    set: new Set(['a']),
  };
}

describe('DomainEvent & RootDomainEvent', () => {
  it('generates a UUIDv7 event id when none is provided', () => {
    const event = new CustomDomainEvent('something happened');
    expect(event.id).toBeDefined();
    expect(isUuidV7(event.id)).toBe(true);
    expect(event.detail).toBe('something happened');
  });

  it('preserves custom event id when provided', () => {
    const customId = '018f0000-0000-7000-8000-000000000000';
    const event = new CustomDomainEvent('custom', customId);
    expect(event.id).toBe(customId);
  });

  it('RootDomainEvent captures a detached payload without retaining the entity', () => {
    const entity = { id: 'user-1', name: 'Alice' };
    const event = new UserCreatedEvent(entity);

    expect('entity' in event).toBe(false);
    expect(event.id).toBeDefined();
    expect(event.payload).toEqual({ id: 'user-1', name: 'Alice' });
    expect(Object.isFrozen(event.payload)).toBe(true);

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

    expect(event.payload.profile.address.city).toBe('Athens');
    expect(event.payload.profile.tags).toEqual(['developer', 'admin']);

    // Mutating nested source data must NOT affect the captured event payload
    nestedData.profile.address.city = 'Thessaloniki';
    nestedData.profile.tags.push('superadmin');

    expect(event.payload.profile.address.city).toBe('Athens');
    expect(event.payload.profile.tags).toEqual(['developer', 'admin']);

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

    createdAt.setFullYear(2099);
    expect(event.payload.createdAt.getFullYear()).toBe(2026);

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

    expect(event.payload.map.get('k1')).toBe('v1');
    expect(event.payload.map.get('nested')).toEqual({ count: 1 });
    expect(event.payload.set.has('item1')).toBe(true);

    sourceMap.set('k1', 'mutated');
    sourceMap.set('k2', 'new');
    sourceSet.add('item2');

    expect(event.payload.map.get('k1')).toBe('v1');
    expect(event.payload.map.has('k2')).toBe(false);
    expect(event.payload.set.has('item2')).toBe(false);

    expect(() => {
      event.payload.map.set('k3', 'val');
    }).toThrow(/Cannot mutate frozen Map/);
    expect(() => {
      event.payload.map.delete('k1');
    }).toThrow(/Cannot mutate frozen Map/);
    expect(() => {
      event.payload.map.clear();
    }).toThrow(/Cannot mutate frozen Map/);

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

  it('does not protect Date, Map and Set internals from prototype method calls', () => {
    class BuiltInsEvent extends RootDomainEvent<unknown, BuiltIns> {
      constructor(payload: BuiltIns) {
        super({}, payload);
      }
    }
    const event = new BuiltInsEvent(builtIns());

    Date.prototype.setTime.call(event.payload.at, 0);
    Map.prototype.set.call(event.payload.map, 'k', 'changed');
    Set.prototype.add.call(event.payload.set, 'added');

    expect(Object.isFrozen(event.payload.at)).toBe(true);
    expect(event.payload.at.getTime()).toBe(0);
    expect(event.payload.map.get('k')).toBe('changed');
    expect(event.payload.set.has('added')).toBe(true);
  });

  it('clonePayload isolates each copy from prototype-level changes to another', () => {
    class BuiltInsEvent extends RootDomainEvent<unknown, BuiltIns> {
      constructor(payload: BuiltIns) {
        super({}, payload);
      }
    }
    const event = new BuiltInsEvent(builtIns());
    const first = event.clonePayload();
    const second = event.clonePayload();

    Date.prototype.setTime.call(first.at, 0);
    Map.prototype.set.call(first.map, 'k', 'changed');
    Set.prototype.add.call(first.set, 'added');

    for (const view of [event.payload, second]) {
      expect(view.at.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(view.map.get('k')).toBe('v');
      expect(view.set.has('added')).toBe(false);
    }
    expect(second).not.toBe(event.payload);
    expect(Object.isFrozen(second)).toBe(true);
    expect(() => second.map.set('k', 'x')).toThrow(/Cannot mutate frozen Map/);
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
 * consumers receive only the frozen payload and event-time identity scalars.
 */
describe('RootDomainEvent event-time state', () => {
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
      this.onUpdate();
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

  it('retains event-time metadata while the aggregate continues its lifecycle', () => {
    const thing = new Thing({ label: 'before' });
    const event = new ThingRenamed(thing);
    const id = thing.id;
    const version = thing.version;

    expect(Object.isFrozen(thing)).toBe(false);
    thing.rename('after');

    expect(thing.label).toBe('after');
    expect(thing.version).toBe(version + 1);
    expect(event.aggregateId).toBe(id);
    expect(event.aggregateVersion).toBe(version);
    expect(event.payload).toMatchObject({ id, version, label: 'before' });
    expect('entity' in event).toBe(false);
  });

  it('handles null entity in RootDomainEvent by defaulting payload to empty object', () => {
    class NullEntityEvent extends RootDomainEvent<any> {
      constructor() {
        super(null);
      }
    }
    const nullEvent = new NullEntityEvent();
    expect(nullEvent.payload).toEqual({});
    expect(nullEvent.aggregateId).toBeUndefined();
    expect(nullEvent.aggregateVersion).toBeUndefined();
  });

  it('clones RegExp, null-prototype, custom-prototype, and accessor properties in payload', () => {
    class CustomPayloadClass {
      foo = 'bar';
    }
    const nullProto = Object.create(null);
    nullProto.prop = 42;
    const accessorObj = {};
    Object.defineProperty(accessorObj, 'computed', {
      get() {
        return 100;
      },
      enumerable: true,
      configurable: true,
    });
    const complexPayload = {
      regex: /abc/gi,
      nullProto,
      customInstance: new CustomPayloadClass(),
      accessor: accessorObj,
    };
    class ComplexPayloadEvent extends RootDomainEvent<any> {
      constructor() {
        super({}, complexPayload);
      }
    }
    const complexEvent = new ComplexPayloadEvent();
    expect(complexEvent.payload.regex).toBeInstanceOf(RegExp);
    expect(complexEvent.payload.regex.source).toBe('abc');
    expect(complexEvent.payload.regex.flags).toBe('gi');
    expect(Object.getPrototypeOf(complexEvent.payload.nullProto)).toBeNull();
    expect(complexEvent.payload.nullProto.prop).toBe(42);
    expect(Object.getPrototypeOf(complexEvent.payload.customInstance)).toBe(
      Object.prototype,
    );
    expect(complexEvent.payload.customInstance.foo).toBe('bar');
    expect(complexEvent.payload.accessor.computed).toBe(100);
  });
});

describe('deepCloneAndFreeze', () => {
  it('skips a key that a Proxy lists but describes as absent', () => {
    // A Proxy may list a configurable key in ownKeys and still report no
    // descriptor for it; there is nothing to copy for that key.
    const target: Record<string, unknown> = { kept: 1 };
    const listed = new Proxy(target, {
      ownKeys: () => ['kept', 'ghost'],
      getOwnPropertyDescriptor: (t, key) =>
        key === 'ghost' ? undefined : Reflect.getOwnPropertyDescriptor(t, key),
    });

    const copy = deepCloneAndFreeze(listed);

    expect(copy).toEqual({ kept: 1 });
    expect(Object.hasOwn(copy, 'ghost')).toBe(false);
    expect(Object.isFrozen(copy)).toBe(true);
  });
});
