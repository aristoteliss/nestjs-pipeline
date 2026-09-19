/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';
import { RootEntity } from '../models/root.entity';
import { DomainEvent } from './domain.event';

/**
 * A {@link DomainEvent} carrying aggregate identity/version and an immutable
 * state payload snapshot captured at event creation time.
 *
 * Capturing an immutable snapshot protects asynchronous event consumers from
 * subsequent in-memory mutations on the aggregate root instance. That protection
 * only applies to what a consumer reads from {@link RootDomainEvent.payload};
 * RootDomainEvent retains only the detached payload and aggregate identity/version.
 *
 * @typeParam T - The aggregate input type used to infer the snapshot payload.
 * @typeParam TPayload - The snapshot payload type.
 */
export type InferPayload<T> = T extends { toJSON(): infer J }
  ? J
  : T extends object
    ? T
    : unknown;

const MUTATING_DATE_METHODS = [
  'setTime',
  'setMilliseconds',
  'setUTCMilliseconds',
  'setSeconds',
  'setUTCSeconds',
  'setMinutes',
  'setUTCMinutes',
  'setHours',
  'setUTCHours',
  'setDate',
  'setUTCDate',
  'setMonth',
  'setUTCMonth',
  'setFullYear',
  'setUTCFullYear',
] as const;

const MUTATING_MAP_METHODS = ['set', 'delete', 'clear'] as const;
const MUTATING_SET_METHODS = ['add', 'delete', 'clear'] as const;

/**
 * Deep clones and recursively freezes any value, object, array, Date, Set, Map, or RegExp.
 * Safely handles circular references via a WeakMap tracking visited objects.
 * Guarantees that mutations on original nested objects do not leak into the clone.
 */
export function deepCloneAndFreeze<T>(
  value: T,
  seen = new WeakMap<object, unknown>(),
): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value) as T;
  }

  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    for (const method of MUTATING_DATE_METHODS) {
      Object.defineProperty(copy, method, {
        value: () => {
          throw new TypeError('Cannot mutate frozen Date');
        },
        configurable: false,
        writable: false,
      });
    }
    return Object.freeze(copy) as unknown as T;
  }

  if (value instanceof RegExp) {
    const copy = new RegExp(value.source, value.flags);
    return Object.freeze(copy) as unknown as T;
  }

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (let i = 0; i < value.length; i++) {
      copy[i] = deepCloneAndFreeze(value[i], seen);
    }
    return Object.freeze(copy) as unknown as T;
  }

  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy);
    for (const [k, v] of value.entries()) {
      copy.set(deepCloneAndFreeze(k, seen), deepCloneAndFreeze(v, seen));
    }
    for (const method of MUTATING_MAP_METHODS) {
      Object.defineProperty(copy, method, {
        value: () => {
          throw new TypeError('Cannot mutate frozen Map');
        },
        configurable: false,
        writable: false,
      });
    }
    return Object.freeze(copy) as unknown as T;
  }

  if (value instanceof Set) {
    const copy = new Set();
    seen.set(value, copy);
    for (const v of value.values()) {
      copy.add(deepCloneAndFreeze(v, seen));
    }
    for (const method of MUTATING_SET_METHODS) {
      Object.defineProperty(copy, method, {
        value: () => {
          throw new TypeError('Cannot mutate frozen Set');
        },
        configurable: false,
        writable: false,
      });
    }
    return Object.freeze(copy) as unknown as T;
  }

  const proto = Object.getPrototypeOf(value);
  const copy = Object.create(
    proto === Object.prototype || proto === null ? proto : Object.prototype,
  );
  seen.set(value, copy);

  for (const key of Reflect.ownKeys(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (desc) {
      if ('value' in desc) {
        desc.value = deepCloneAndFreeze(desc.value, seen);
      }
      Object.defineProperty(copy, key, desc);
    }
  }

  return Object.freeze(copy) as T;
}

/**
 * A {@link DomainEvent} carrying aggregate identity/version and an immutable
 * state payload snapshot captured at event creation time.
 *
 * Capturing an immutable snapshot protects asynchronous event consumers from
 * subsequent in-memory mutations on the aggregate root instance.
 *
 * @typeParam T - The aggregate input type used to infer the snapshot payload.
 * @typeParam TPayload - The snapshot payload type.
 */
export class RootDomainEvent<
  T = RootEntity<Partial<RootEntitySnapshot>>,
  TPayload = InferPayload<T>,
> extends DomainEvent {
  /** Deep-frozen state captured when the event was raised. */
  public readonly payload: Readonly<TPayload>;

  /**
   * Identity of the aggregate that raised the event.
   *
   * An immutable scalar, so a consumer that only needs to know *which* aggregate
   * changed has no reason to reach for the live instance.
   */
  public readonly aggregateId?: string;

  /** Aggregate version at the moment the event was raised. */
  public readonly aggregateVersion?: number;

  protected constructor(entity: T, payload?: TPayload) {
    super();

    const source = entity as { id?: unknown; version?: unknown } | undefined;
    this.aggregateId = typeof source?.id === 'string' ? source.id : undefined;
    this.aggregateVersion =
      typeof source?.version === 'number' ? source.version : undefined;
    let rawPayload: unknown;
    if (payload !== undefined) {
      rawPayload = payload;
    } else if (
      entity &&
      typeof (entity as { toJSON?: () => unknown }).toJSON === 'function'
    ) {
      rawPayload = (entity as unknown as { toJSON: () => unknown }).toJSON();
    } else if (entity && typeof entity === 'object') {
      rawPayload = { ...entity };
    } else {
      rawPayload = {};
    }
    this.payload = deepCloneAndFreeze(rawPayload) as Readonly<TPayload>;
  }
}
