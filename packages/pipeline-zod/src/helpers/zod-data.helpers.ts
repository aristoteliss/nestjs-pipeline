/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ZodType } from 'zod';

export const ZOD_RAW_INPUT_KEY = Symbol.for('@nestjs-pipeline/zod:raw-input');
export const ZOD_VALIDATED_DATA_KEY = Symbol.for(
  '@nestjs-pipeline/zod:validated-data',
);

/** The schema a request was last parsed with, and the payload that parse produced. */
interface ValidationState {
  readonly schema: ZodType;
  readonly snapshot: Record<string, unknown>;
}

const requestRawInputMap = new WeakMap<object, unknown>();
const requestValidationMap = new WeakMap<object, ValidationState>();

/** Records constructor input, including explicitly supplied null or undefined. */
export function setRawInput(request: object, rawInput: unknown): void {
  requestRawInputMap.set(request, rawInput);
}

/** Returns original constructor input by reference, or the request when no input was recorded. */
export function getRawInput<T = unknown>(request: unknown): T | undefined {
  if (request && typeof request === 'object') {
    if (requestRawInputMap.has(request))
      return requestRawInputMap.get(request) as T;
    const raw = (request as Record<symbol, unknown>)[ZOD_RAW_INPUT_KEY];
    if (raw !== undefined) return raw as T;
  }
  return request as T;
}

/**
 * Records the parsed payload a request now carries, detached from the live
 * instance. The snapshot covers exactly the keys the schema produced, so fields
 * the request class owns itself are neither tracked nor removed later.
 */
export function setValidatedData(
  request: object,
  schema: ZodType,
  data: Record<string, unknown>,
): void {
  requestValidationMap.set(request, {
    schema,
    snapshot: Object.freeze(cloneData(data)),
  });
}

/** Internal validation provenance; caller-supplied symbol metadata cannot establish it. */
export function getValidationState(
  request: object,
): ValidationState | undefined {
  return requestValidationMap.get(request);
}

/**
 * Returns a detached copy of the parsed payload for inspection. Its top level is
 * frozen and every call returns a fresh copy, so changing it cannot change the
 * validation state the behavior relies on. Without an internal validation
 * record, it falls back to a value stored under `ZOD_VALIDATED_DATA_KEY`; that
 * value is returned as data but never establishes a trusted validation result.
 */
export function getValidatedData<T = Record<string, unknown>>(
  request: unknown,
): T | undefined {
  if (!request || typeof request !== 'object') return undefined;
  const snapshot =
    requestValidationMap.get(request)?.snapshot ??
    (request as Record<symbol, unknown>)[ZOD_VALIDATED_DATA_KEY];
  return snapshot === undefined
    ? undefined
    : (Object.freeze(cloneData(snapshot)) as T);
}

/** Clones enumerable data, rich collections and binary values, preserving cycles and shared references. */
export function cloneData<T>(data: T): T {
  return cloneValue(data, new WeakMap());
}

function isBinary(value: object): value is ArrayBuffer | ArrayBufferView {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function binaryBytes(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  return value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function enumerableKeys(value: object): (string | symbol)[] {
  const keys: (string | symbol)[] = Object.keys(value);
  for (const symbol of Object.getOwnPropertySymbols(value)) {
    if (Object.getOwnPropertyDescriptor(value, symbol)?.enumerable)
      keys.push(symbol);
  }
  return keys;
}

function cloneValue<T>(data: T, seen: WeakMap<object, unknown>): T {
  if (data === null || typeof data !== 'object') return data;
  if (seen.has(data)) return seen.get(data) as T;

  if (isBinary(data)) {
    // Contents copy wholesale; walking typed-array indices would be O(bytes).
    const binary = Buffer.isBuffer(data)
      ? Buffer.from(data)
      : structuredClone(data);
    seen.set(data, binary);
    return binary as T;
  }

  let copy: object;
  if (data instanceof Date) copy = new Date(data.getTime());
  else if (data instanceof RegExp) {
    const expression = new RegExp(data.source, data.flags);
    expression.lastIndex = data.lastIndex;
    copy = expression;
  } else if (data instanceof Map) copy = new Map();
  else if (data instanceof Set) copy = new Set();
  else if (Array.isArray(data)) copy = new Array(data.length);
  else
    copy = Object.create(
      Object.getPrototypeOf(data) === null ? null : Object.prototype,
    );

  seen.set(data, copy);
  if (data instanceof Map) {
    for (const [key, value] of data)
      (copy as Map<unknown, unknown>).set(
        cloneValue(key, seen),
        cloneValue(value, seen),
      );
  } else if (data instanceof Set) {
    for (const value of data)
      (copy as Set<unknown>).add(cloneValue(value, seen));
  }
  for (const key of enumerableKeys(data)) {
    Object.defineProperty(copy, key, {
      value: cloneValue(Reflect.get(data, key), seen),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return copy as T;
}

/** Structural data equality with one-to-one collection matching and cycle detection. */
export function deepEqual(a: unknown, b: unknown): boolean {
  return equalData(a, b, new Map());
}

function equalData(
  a: unknown,
  b: unknown,
  pairs: Map<object, object>,
): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== 'object' ||
    a === null ||
    typeof b !== 'object' ||
    b === null
  )
    return false;
  if (Object.prototype.toString.call(a) !== Object.prototype.toString.call(b))
    return false;
  if (isBinary(a) && isBinary(b)) {
    const left = binaryBytes(a);
    const right = binaryBytes(b);
    return (
      left.length === right.length &&
      left.every((byte, index) => byte === right[index])
    );
  }
  if (
    a instanceof Date &&
    b instanceof Date &&
    !Object.is(a.getTime(), b.getTime())
  )
    return false;
  if (
    a instanceof RegExp &&
    b instanceof RegExp &&
    (a.source !== b.source ||
      a.flags !== b.flags ||
      a.lastIndex !== b.lastIndex)
  )
    return false;
  if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length)
    return false;

  // Both directions of the current comparison path, so a cycle only matches the
  // partner it was first paired with.
  if (pairs.has(a)) return pairs.get(a) === b;
  if (pairs.has(b)) return false;
  pairs.set(a, b);
  pairs.set(b, a);
  try {
    if (
      (a instanceof Map && b instanceof Map) ||
      (a instanceof Set && b instanceof Set)
    ) {
      if (a.size !== b.size) return false;
      const remaining: unknown[] = [...b];
      for (const item of a) {
        const index = remaining.findIndex((other) =>
          equalData(item, other, pairs),
        );
        if (index < 0) return false;
        remaining.splice(index, 1);
      }
    }
    const keysA = enumerableKeys(a);
    const keysB = enumerableKeys(b);
    if (keysA.length !== keysB.length) return false;
    const presentInB = new Set(keysB);
    return keysA.every(
      (key) =>
        presentInB.has(key) &&
        equalData(Reflect.get(a, key), Reflect.get(b, key), pairs),
    );
  } finally {
    // A rejected collection candidate must not leave path state for the next one.
    pairs.delete(a);
    pairs.delete(b);
  }
}

/**
 * Reports whether the request still carries the payload it was validated with.
 * Only the schema-produced fields are compared: class-owned fields and
 * non-enumerable CQRS/session metadata are outside the validated payload.
 */
export function hasBeenMutated(
  request: Record<string, unknown>,
  snapshot: Record<string, unknown>,
): boolean {
  return Object.keys(snapshot).some(
    (key) =>
      !Object.hasOwn(request, key) || !deepEqual(request[key], snapshot[key]),
  );
}
