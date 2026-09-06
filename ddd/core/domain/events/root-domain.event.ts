/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';
import { RootEntity } from '../models/root.entity';
import { DomainEvent } from './domain.event';

/**
 * A {@link DomainEvent} that carries the aggregate root affected by the event
 * along with an immutable state payload snapshot captured at event creation time.
 *
 * Capturing an immutable snapshot protects asynchronous event consumers from
 * subsequent in-memory mutations on the aggregate root instance.
 *
 * @typeParam T - The entity (aggregate root) type attached to the event.
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
 * A {@link DomainEvent} that carries the aggregate root affected by the event
 * along with an immutable state payload snapshot captured at event creation time.
 *
 * Capturing an immutable snapshot protects asynchronous event consumers from
 * subsequent in-memory mutations on the aggregate root instance.
 *
 * @typeParam T - The entity (aggregate root) type attached to the event.
 * @typeParam TPayload - The snapshot payload type.
 */
export class RootDomainEvent<
  T = RootEntity<Partial<RootEntitySnapshot>>,
  TPayload = InferPayload<T>,
> extends DomainEvent {
  public readonly entity: T;
  public readonly payload: Readonly<TPayload>;

  protected constructor(entity: T, payload?: TPayload) {
    super();
    this.entity = entity;
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
